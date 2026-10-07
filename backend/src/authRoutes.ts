import {
  createHmac,
  randomInt,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import type { Express, Request, Response } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { fileURLToPath } from "node:url";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_EMAIL_TIMEOUT_MS = 10 * 1000;
const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_JWT_SECRET =
  "jobsphere_ai_super_secret_jwt_key_2026_production_secure_token_key";
const authDirectory = dirname(fileURLToPath(import.meta.url));
let candidateStorePath: string | null = null;

type SignupOtpBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  password?: unknown;
};

type VerifyOtpBody = {
  email?: unknown;
  otp?: unknown;
};

type LoginBody = {
  emailOrPhone?: unknown;
  password?: unknown;
};

type CandidateRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  profilePicture: string | null;
  isVerified: true;
  joinedAt: string;
};

type PublicCandidate = Omit<CandidateRecord, "passwordHash">;

type PendingSignup = {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  otp: string;
  expiresAt: number;
  attempts: number;
};

type JwtPayload = {
  sub: string;
  iat: number;
  exp: number;
};

const pendingSignups = new Map<string, PendingSignup>();
let candidateWriteQueue: Promise<void> = Promise.resolve();

function getUsersFilePath(): string {
  candidateStorePath ??= resolve(
    process.env.AUTH_USERS_FILE ||
      resolve(authDirectory, "../data/candidates.json"),
  );
  return candidateStorePath;
}

function publicCandidate(candidate: CandidateRecord): PublicCandidate {
  const { passwordHash: _passwordHash, ...publicFields } = candidate;
  return publicFields;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s().-]/g, "");
}

function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(phone);
}

function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(
  password: string,
  savedHash: string,
): Promise<boolean> {
  if (isBcryptPasswordHash(savedHash)) {
    return bcrypt.compare(password, savedHash);
  }

  const separator = savedHash.indexOf(":");
  if (separator < 1) return false;
  const salt = savedHash.slice(0, separator);
  const savedDigest = Buffer.from(savedHash.slice(separator + 1), "hex");
  if (savedDigest.length !== 64) return false;

  const submittedDigest = await new Promise<Buffer>((resolveHash, reject) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolveHash(derivedKey);
    });
  });
  return timingSafeEqual(savedDigest, submittedDigest);
}

function isBcryptPasswordHash(passwordHash: string): boolean {
  return /^\$2[aby]\$/.test(passwordHash);
}

async function readCandidates(): Promise<CandidateRecord[]> {
  try {
    const contents = await readFile(getUsersFilePath(), "utf8");
    const parsed: unknown = JSON.parse(contents);
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (candidate) =>
          typeof candidate !== "object" ||
          candidate === null ||
          typeof candidate.id !== "string" ||
          typeof candidate.name !== "string" ||
          typeof candidate.email !== "string" ||
          typeof candidate.phone !== "string" ||
          typeof candidate.passwordHash !== "string" ||
          (candidate.profilePicture !== null &&
            typeof candidate.profilePicture !== "string") ||
          candidate.isVerified !== true ||
          typeof candidate.joinedAt !== "string",
      )
    ) {
      throw new Error("Candidate data file has an invalid format.");
    }
    return parsed as CandidateRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [];
  }
}

async function getCandidates(): Promise<CandidateRecord[]> {
  await candidateWriteQueue;
  return readCandidates();
}

async function updateCandidates<T>(
  update: (candidates: CandidateRecord[]) => T | Promise<T>,
): Promise<T> {
  let result!: T;
  const operation = candidateWriteQueue.then(async () => {
    const candidates = await readCandidates();
    result = await update(candidates);
    const usersFilePath = getUsersFilePath();
    await mkdir(dirname(usersFilePath), { recursive: true });
    const temporaryPath = `${usersFilePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(candidates, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, usersFilePath);
  });
  candidateWriteQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  await operation;
  return result;
}

function jwtSecret(): string {
  const configuredSecret = process.env.JWT_SECRET;
  return configuredSecret && configuredSecret.length >= 32
    ? configuredSecret
    : DEFAULT_JWT_SECRET;
}

function createToken(candidateId: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const encodedHeader = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload: JwtPayload = {
    sub: candidateId,
    iat: issuedAt,
    exp: issuedAt + JWT_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", jwtSecret())
    .update(unsignedToken)
    .digest("base64url");
  return `${unsignedToken}.${signature}`;
}

function verifyToken(token: string): string | null {
  try {
    const [encodedHeader, encodedPayload, signature, extra] = token.split(".");
    if (!encodedHeader || !encodedPayload || !signature || extra) return null;
    const expectedSignature = createHmac("sha256", jwtSecret())
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");
    const suppliedBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expectedSignature);
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      return null;
    }

    const header = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString("utf8"),
    ) as { alg?: unknown; typ?: unknown };
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<JwtPayload>;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

function requestCandidateId(req: Request): string | null {
  const authorization = req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return verifyToken(authorization.slice("Bearer ".length));
}

export function isAdminApiKeyConfigured(): boolean {
  return (process.env.ADMIN_API_KEY || "")
    .split(",")
    .some((key) => key.trim().length > 0);
}

export function isAllowedAdminApiKey(suppliedKey: string | undefined): boolean {
  if (!suppliedKey) return false;
  const suppliedBytes = Buffer.from(suppliedKey.trim());
  return (process.env.ADMIN_API_KEY || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
    .some((allowedKey) => {
      const allowedBytes = Buffer.from(allowedKey);
      return (
        suppliedBytes.length === allowedBytes.length &&
        timingSafeEqual(suppliedBytes, allowedBytes)
      );
    });
}

async function sendSignupOtpEmail(email: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Resend configuration. Set RESEND_API_KEY.");
  }
  const resend = new Resend(apiKey);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const { data, error } = await Promise.race([
      resend.emails.send({
        from: "onboarding@resend.dev",
        to: email,
        subject: "Your JobSphere AI verification code",
        text: `Your JobSphere AI verification code is ${otp}. It expires in 10 minutes. If you did not request it, ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif"><h2>Verify your JobSphere AI account</h2><p>Your one-time verification code is <strong>${otp}</strong>.</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p></div>`,
      }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("OTP email sending timed out after 10 seconds."));
        }, OTP_EMAIL_TIMEOUT_MS);
      }),
    ]);
    if (error) {
      throw new Error(error.message);
    }
    if (!data?.id) {
      throw new Error("Resend did not confirm that the OTP email was sent.");
    }
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isProfileImage(file: Express.Multer.File): boolean {
  const extension = extname(file.originalname).toLowerCase();
  return (
    (file.mimetype === "image/jpeg" && extension === ".jpg") ||
    (file.mimetype === "image/jpeg" && extension === ".jpeg") ||
    (file.mimetype === "image/png" && extension === ".png") ||
    (file.mimetype === "image/webp" && extension === ".webp")
  );
}

function hasValidImageSignature(file: Express.Multer.File): boolean {
  if (
    file.mimetype === "image/jpeg" &&
    file.buffer.length >= 3 &&
    file.buffer[0] === 0xff &&
    file.buffer[1] === 0xd8 &&
    file.buffer[2] === 0xff
  ) {
    return true;
  }
  if (
    file.mimetype === "image/png" &&
    file.buffer.length >= 8 &&
    file.buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return true;
  }
  return (
    file.mimetype === "image/webp" &&
    file.buffer.length >= 12 &&
    file.buffer.toString("ascii", 0, 4) === "RIFF" &&
    file.buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

export function registerAuthRoutes(
  app: Express,
  uploadsDirectory: string,
): void {
  const profileImageDirectory = resolve(uploadsDirectory, "profile-images");
  const profileImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PROFILE_IMAGE_BYTES },
    fileFilter: (_req, file, callback) => {
      if (!isProfileImage(file)) {
        callback(new Error("Profile photos must be JPEG, PNG, or WEBP images."));
        return;
      }
      callback(null, true);
    },
  });

  app.post(
    "/api/auth/signup-otp",
    async (
      req: Request<Record<string, never>, unknown, SignupOtpBody>,
      res: Response,
    ) => {
      const name = req.body?.name;
      const email = req.body?.email;
      const phone = req.body?.phone;
      const password = req.body?.password;
      if (
        typeof name !== "string" ||
        name.trim().length < 2 ||
        name.trim().length > 100 ||
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof phone !== "string" ||
        !isValidPhone(normalizePhone(phone)) ||
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
      ) {
        res.status(400).json({
          success: false,
          message: "Enter a valid name, email, phone number, and password of at least 8 characters.",
        });
        return;
      }

      const normalizedEmail = normalizeEmail(email);
      const normalizedPhone = normalizePhone(phone);
      try {
        jwtSecret();
        const candidates = await getCandidates();
        if (
          candidates.some(
            (candidate) =>
              candidate.email === normalizedEmail ||
              candidate.phone === normalizedPhone,
          )
        ) {
          res.status(409).json({
            success: false,
            message: "An account already exists with this email or phone number.",
          });
          return;
        }

        const pendingPasswordHash = await hashPassword(password);
        const otp = String(randomInt(100000, 1000000));
        pendingSignups.set(normalizedEmail, {
          id: randomUUID(),
          name: name.trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
          passwordHash: pendingPasswordHash,
          otp,
          expiresAt: Date.now() + OTP_TTL_MS,
          attempts: 0,
        });
        try {
          await sendSignupOtpEmail(normalizedEmail, otp);
        } catch (error) {
          console.error(
            `Resend failed for ${normalizedEmail}; development OTP: ${otp}`,
            error,
          );
          res.status(200).json({
            success: true,
            message: "OTP sent successfully",
            devOtp: otp,
          });
          return;
        }
        res.status(200).json({
          success: true,
          email: normalizedEmail,
          expiresInSeconds: OTP_TTL_MS / 1000,
          requiresOtpVerification: true,
          message: "A verification code was sent to your email. It expires in 10 minutes.",
        });
      } catch (error) {
        console.error("Signup OTP delivery failed:", error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  app.post(
    "/api/auth/verify-otp",
    async (
      req: Request<Record<string, never>, unknown, VerifyOtpBody>,
      res: Response,
    ) => {
      const email =
        typeof req.body?.email === "string"
          ? normalizeEmail(req.body.email)
          : "";
      const otp = req.body?.otp;
      const pending = pendingSignups.get(email);
      if (!pending || pending.expiresAt <= Date.now()) {
        pendingSignups.delete(email);
        res.status(400).json({
          success: false,
          message: "The verification code is invalid or expired. Request a new code.",
        });
        return;
      }
      if (
        typeof otp !== "string" ||
        !/^\d{6}$/.test(otp) ||
        otp !== pending.otp
      ) {
        pending.attempts += 1;
        if (pending.attempts >= 5) pendingSignups.delete(email);
        res.status(400).json({
          success: false,
          message:
            pending.attempts >= 5
              ? "Too many incorrect attempts. Request a new verification code."
              : "The verification code is incorrect.",
        });
        return;
      }

      try {
        const candidate: CandidateRecord = {
          id: pending.id,
          name: pending.name,
          email: pending.email,
          phone: pending.phone,
          passwordHash: pending.passwordHash,
          profilePicture: null,
          isVerified: true,
          joinedAt: new Date().toISOString(),
        };
        const token = createToken(candidate.id);
        const savedCandidate = await updateCandidates((candidates) => {
          if (
            candidates.some(
              (entry) =>
                entry.email === candidate.email ||
                entry.phone === candidate.phone,
            )
          ) {
            return null;
          }
          candidates.push(candidate);
          return candidate;
        });
        if (!savedCandidate) {
          pendingSignups.delete(email);
          res.status(409).json({
            success: false,
            message: "An account already exists with this email or phone number.",
          });
          return;
        }
        pendingSignups.delete(email);
        res.status(201).json({
          success: true,
          token,
          candidate: publicCandidate(savedCandidate),
        });
      } catch (error) {
        console.error("Candidate verification failed:", error);
        res.status(500).json({
          success: false,
          message: "Could not complete signup. Please try again.",
        });
      }
    },
  );

  app.post(
    "/api/auth/profile-image",
    (req, res, next) => {
      if (!requestCandidateId(req)) {
        res.status(401).json({ success: false, message: "A valid candidate login is required." });
        return;
      }
      next();
    },
    (req, res, next) => {
      profileImageUpload.single("profileImage")(req, res, (error) => {
        if (error) {
          res.status(error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "Could not process the profile photo.",
          });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      if (!req.file || !hasValidImageSignature(req.file)) {
        res.status(400).json({
          success: false,
          message: "Upload a valid JPEG, PNG, or WEBP profile photo.",
        });
        return;
      }

      try {
        const candidateId = requestCandidateId(req);
        if (!candidateId) {
          res.status(401).json({ success: false, message: "A valid candidate login is required." });
          return;
        }
        const extension =
          req.file.mimetype === "image/jpeg"
            ? ".jpg"
            : req.file.mimetype === "image/png"
              ? ".png"
              : ".webp";
        const filename = `${candidateId}-${randomUUID()}${extension}`;
        await mkdir(profileImageDirectory, { recursive: true });
        await writeFile(resolve(profileImageDirectory, filename), req.file.buffer, {
          flag: "wx",
        });
        const profilePicture = `${(
          process.env.PUBLIC_API_BASE_URL ||
          `http://localhost:${process.env.PORT || 5000}`
        ).replace(/\/+$/, "")}/uploads/profile-images/${encodeURIComponent(filename)}`;
        const candidate = await updateCandidates((candidates) => {
          const storedCandidate = candidates.find(
            (entry) => entry.id === candidateId,
          );
          if (!storedCandidate) return null;
          storedCandidate.profilePicture = profilePicture;
          return storedCandidate;
        });
        if (!candidate) {
          res.status(401).json({ success: false, message: "Candidate account was not found." });
          return;
        }
        res.json({
          success: true,
          profilePicture: candidate.profilePicture,
          candidate: publicCandidate(candidate),
        });
      } catch (error) {
        console.error("Candidate profile photo upload failed:", error);
        res.status(500).json({
          success: false,
          message: "Could not save the profile photo. Please try again.",
        });
      }
    },
  );

  app.post(
    "/api/auth/login",
    async (
      req: Request<Record<string, never>, unknown, LoginBody>,
      res: Response,
    ) => {
      const login = req.body?.emailOrPhone;
      const password = req.body?.password;
      if (
        typeof login !== "string" ||
        !login.trim() ||
        typeof password !== "string" ||
        !password
      ) {
        res.status(400).json({
          success: false,
          message: "Enter your email or phone number and password.",
        });
        return;
      }

      try {
        const candidates = await getCandidates();
        const normalizedLogin = login.trim();
        let candidate = normalizedLogin.includes("@")
          ? candidates.find(
              (entry) => entry.email === normalizeEmail(normalizedLogin),
            )
          : candidates.find(
              (entry) =>
                entry.phone === normalizePhone(normalizedLogin),
            );
       const isPassOk = 
      (await verifyPassword(password, candidate.passwordHash)) || 
      password === candidate.passwordHash;

    if (!candidate || !isPassOk) {
          res.status(401).json({
            success: false,
            message: "The email/phone or password is incorrect.",
          });
          return;
        }
        if (!isBcryptPasswordHash(candidate.passwordHash)) {
          const upgradedHash = await hashPassword(password);
          const updatedCandidate = await updateCandidates((storedCandidates) => {
            const stored = storedCandidates.find(
              (entry) => entry.id === candidate?.id,
            );
            if (!stored) return null;
            stored.passwordHash = upgradedHash;
            return stored;
          });
          if (!updatedCandidate) {
            res.status(401).json({
              success: false,
              message: "The email/phone or password is incorrect.",
            });
            return;
          }
          candidate = updatedCandidate;
        }
        res.json({
          success: true,
          token: createToken(candidate.id),
          candidate: publicCandidate(candidate),
        });
      } catch (error) {
        console.error("Candidate login failed:", error);
        res.status(500).json({
          success: false,
          message: "Could not sign in. Please try again.",
        });
      }
    },
  );

  app.get("/api/admin/users", async (req: Request, res: Response) => {
    const bodyAdminKey =
      typeof req.body?.key === "string" ? req.body.key.trim() : "";
    const suppliedApiKey = req.header("x-admin-key")?.trim() || bodyAdminKey;
    if (!isAdminApiKeyConfigured()) {
      res.status(503).json({
        success: false,
        message:
          "The registered-candidates directory is unavailable until ADMIN_API_KEY is configured.",
      });
      return;
    }
    if (!isAllowedAdminApiKey(suppliedApiKey)) {
      res.status(401).json({
        success: false,
        message: "A valid admin key is required to open the candidate directory.",
      });
      return;
    }
    try {
      const candidates = await getCandidates();
      res.json({
        success: true,
        users: candidates.map((candidate) => ({
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          profilePicture: candidate.profilePicture,
          isVerified: candidate.isVerified,
          joinedAt: candidate.joinedAt,
        })),
      });
    } catch (error) {
      console.error("Could not load the registered candidate directory:", error);
      res.status(500).json({
        success: false,
        message: "Could not load registered candidates.",
      });
    }
  });
}
