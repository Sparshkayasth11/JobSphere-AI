import { createHmac, randomInt, randomUUID, scrypt, timingSafeEqual, } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import multer from "multer";
import nodemailer from "nodemailer";
import { fileURLToPath } from "node:url";
const OTP_TTL_MS = 10 * 60 * 1000;
const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_JWT_SECRET = "jobsphere_ai_super_secret_jwt_key_2026_production_secure_token_key";
const authDirectory = dirname(fileURLToPath(import.meta.url));
let candidateStorePath = null;
const pendingSignups = new Map();
let cachedCandidates = null;
let candidateWriteQueue = Promise.resolve();
function getUsersFilePath() {
    candidateStorePath ??= resolve(process.env.AUTH_USERS_FILE ||
        resolve(authDirectory, "../data/candidates.json"));
    return candidateStorePath;
}
function publicCandidate(candidate) {
    const { passwordHash: _passwordHash, ...publicFields } = candidate;
    return publicFields;
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function normalizePhone(phone) {
    return phone.trim().replace(/[\s().-]/g, "");
}
function isValidPhone(phone) {
    return /^\+?[1-9]\d{6,14}$/.test(phone);
}
function hashPassword(password, salt = randomUUID()) {
    return new Promise((resolveHash, reject) => {
        scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }
            resolveHash(`${salt}:${derivedKey.toString("hex")}`);
        });
    });
}
async function verifyPassword(password, savedHash) {
    const separator = savedHash.indexOf(":");
    if (separator < 1)
        return false;
    const salt = savedHash.slice(0, separator);
    const savedDigest = Buffer.from(savedHash.slice(separator + 1), "hex");
    if (savedDigest.length !== 64)
        return false;
    const submittedDigest = await new Promise((resolveHash, reject) => {
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
async function getCandidates() {
    if (cachedCandidates)
        return cachedCandidates;
    try {
        const contents = await readFile(getUsersFilePath(), "utf8");
        const parsed = JSON.parse(contents);
        if (!Array.isArray(parsed) ||
            parsed.some((candidate) => typeof candidate !== "object" ||
                candidate === null ||
                typeof candidate.id !== "string" ||
                typeof candidate.name !== "string" ||
                typeof candidate.email !== "string" ||
                typeof candidate.phone !== "string" ||
                typeof candidate.passwordHash !== "string" ||
                (candidate.profilePicture !== null &&
                    typeof candidate.profilePicture !== "string") ||
                candidate.isVerified !== true ||
                typeof candidate.joinedAt !== "string")) {
            throw new Error("Candidate data file has an invalid format.");
        }
        cachedCandidates = parsed;
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
        cachedCandidates = [];
    }
    return cachedCandidates;
}
async function persistCandidates() {
    candidateWriteQueue = candidateWriteQueue
        .catch(() => undefined)
        .then(async () => {
        const candidates = await getCandidates();
        const usersFilePath = getUsersFilePath();
        await mkdir(dirname(usersFilePath), { recursive: true });
        const temporaryPath = `${usersFilePath}.${randomUUID()}.tmp`;
        await writeFile(temporaryPath, JSON.stringify(candidates, null, 2), {
            encoding: "utf8",
            mode: 0o600,
        });
        await rename(temporaryPath, usersFilePath);
    });
    await candidateWriteQueue;
}
function jwtSecret() {
    const configuredSecret = process.env.JWT_SECRET;
    return configuredSecret && configuredSecret.length >= 32
        ? configuredSecret
        : DEFAULT_JWT_SECRET;
}
function createToken(candidateId) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const encodedHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = {
        sub: candidateId,
        iat: issuedAt,
        exp: issuedAt + JWT_TTL_SECONDS,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac("sha256", jwtSecret())
        .update(unsignedToken)
        .digest("base64url");
    return `${unsignedToken}.${signature}`;
}
function verifyToken(token) {
    try {
        const [encodedHeader, encodedPayload, signature, extra] = token.split(".");
        if (!encodedHeader || !encodedPayload || !signature || extra)
            return null;
        const expectedSignature = createHmac("sha256", jwtSecret())
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest("base64url");
        const suppliedBytes = Buffer.from(signature);
        const expectedBytes = Buffer.from(expectedSignature);
        if (suppliedBytes.length !== expectedBytes.length ||
            !timingSafeEqual(suppliedBytes, expectedBytes)) {
            return null;
        }
        const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
        if (header.alg !== "HS256" || header.typ !== "JWT")
            return null;
        const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
        if (typeof payload.sub !== "string" ||
            typeof payload.exp !== "number" ||
            payload.exp <= Math.floor(Date.now() / 1000)) {
            return null;
        }
        return payload.sub;
    }
    catch {
        return null;
    }
}
function requestCandidateId(req) {
    const authorization = req.header("authorization");
    if (!authorization?.startsWith("Bearer "))
        return null;
    return verifyToken(authorization.slice("Bearer ".length));
}
async function sendSignupOtpEmail(email, otp) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 465);
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;
    if (!host || !user || !password || !from) {
        throw new Error("Missing SMTP configuration. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM.");
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("SMTP_PORT must be a valid port number.");
    }
    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass: password },
    });
    await transporter.sendMail({
        from: `JobSphere AI <${from}>`,
        to: email,
        subject: "Your JobSphere AI verification code",
        text: `Your JobSphere AI verification code is ${otp}. It expires in 10 minutes. If you did not request it, ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif"><h2>Verify your JobSphere AI account</h2><p>Your one-time verification code is <strong>${otp}</strong>.</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p></div>`,
    });
}
function isProfileImage(file) {
    const extension = extname(file.originalname).toLowerCase();
    return ((file.mimetype === "image/jpeg" && extension === ".jpg") ||
        (file.mimetype === "image/jpeg" && extension === ".jpeg") ||
        (file.mimetype === "image/png" && extension === ".png") ||
        (file.mimetype === "image/webp" && extension === ".webp"));
}
function hasValidImageSignature(file) {
    if (file.mimetype === "image/jpeg" &&
        file.buffer.length >= 3 &&
        file.buffer[0] === 0xff &&
        file.buffer[1] === 0xd8 &&
        file.buffer[2] === 0xff) {
        return true;
    }
    if (file.mimetype === "image/png" &&
        file.buffer.length >= 8 &&
        file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return true;
    }
    return (file.mimetype === "image/webp" &&
        file.buffer.length >= 12 &&
        file.buffer.toString("ascii", 0, 4) === "RIFF" &&
        file.buffer.toString("ascii", 8, 12) === "WEBP");
}
export function registerAuthRoutes(app, uploadsDirectory) {
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
    app.post("/api/auth/signup-otp", async (req, res) => {
        const name = req.body?.name;
        const email = req.body?.email;
        const phone = req.body?.phone;
        const password = req.body?.password;
        if (typeof name !== "string" ||
            name.trim().length < 2 ||
            name.trim().length > 100 ||
            typeof email !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
            typeof phone !== "string" ||
            !isValidPhone(normalizePhone(phone)) ||
            typeof password !== "string" ||
            password.length < 8 ||
            password.length > 128) {
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
            if (candidates.some((candidate) => candidate.email === normalizedEmail ||
                candidate.phone === normalizedPhone)) {
                res.status(409).json({
                    success: false,
                    message: "An account already exists with this email or phone number.",
                });
                return;
            }
            const pendingPasswordHash = await hashPassword(password);
            const otp = String(randomInt(100000, 1000000));
            await sendSignupOtpEmail(normalizedEmail, otp);
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
            res.status(200).json({
                success: true,
                email: normalizedEmail,
                expiresInSeconds: OTP_TTL_MS / 1000,
                requiresOtpVerification: true,
                message: "A verification code was sent to your email. It expires in 10 minutes.",
            });
        }
        catch (error) {
            console.error("Signup OTP delivery failed:", error);
            res.status(500).json({
                success: false,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });
    app.post("/api/auth/verify-otp", async (req, res) => {
        const email = typeof req.body?.email === "string"
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
        if (typeof otp !== "string" ||
            !/^\d{6}$/.test(otp) ||
            otp !== pending.otp) {
            pending.attempts += 1;
            if (pending.attempts >= 5)
                pendingSignups.delete(email);
            res.status(400).json({
                success: false,
                message: pending.attempts >= 5
                    ? "Too many incorrect attempts. Request a new verification code."
                    : "The verification code is incorrect.",
            });
            return;
        }
        try {
            const candidates = await getCandidates();
            if (candidates.some((candidate) => candidate.email === pending.email ||
                candidate.phone === pending.phone)) {
                pendingSignups.delete(email);
                res.status(409).json({
                    success: false,
                    message: "An account already exists with this email or phone number.",
                });
                return;
            }
            const candidate = {
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
            candidates.push(candidate);
            try {
                await persistCandidates();
            }
            catch (error) {
                const candidateIndex = candidates.findIndex((entry) => entry.id === candidate.id);
                if (candidateIndex >= 0)
                    candidates.splice(candidateIndex, 1);
                throw error;
            }
            pendingSignups.delete(email);
            res.status(201).json({
                success: true,
                token,
                candidate: publicCandidate(candidate),
            });
        }
        catch (error) {
            console.error("Candidate verification failed:", error);
            res.status(500).json({
                success: false,
                message: "Could not complete signup. Please try again.",
            });
        }
    });
    app.post("/api/auth/profile-image", (req, res, next) => {
        if (!requestCandidateId(req)) {
            res.status(401).json({ success: false, message: "A valid candidate login is required." });
            return;
        }
        next();
    }, (req, res, next) => {
        profileImageUpload.single("profileImage")(req, res, (error) => {
            if (error) {
                res.status(error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
                    success: false,
                    message: error instanceof Error
                        ? error.message
                        : "Could not process the profile photo.",
                });
                return;
            }
            next();
        });
    }, async (req, res) => {
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
            const candidates = await getCandidates();
            const candidate = candidates.find((entry) => entry.id === candidateId);
            if (!candidate) {
                res.status(401).json({ success: false, message: "Candidate account was not found." });
                return;
            }
            const extension = req.file.mimetype === "image/jpeg"
                ? ".jpg"
                : req.file.mimetype === "image/png"
                    ? ".png"
                    : ".webp";
            const filename = `${candidate.id}-${randomUUID()}${extension}`;
            await mkdir(profileImageDirectory, { recursive: true });
            await writeFile(resolve(profileImageDirectory, filename), req.file.buffer, {
                flag: "wx",
            });
            candidate.profilePicture = `${(process.env.PUBLIC_API_BASE_URL ||
                `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, "")}/uploads/profile-images/${encodeURIComponent(filename)}`;
            await persistCandidates();
            res.json({
                success: true,
                profilePicture: candidate.profilePicture,
                candidate: publicCandidate(candidate),
            });
        }
        catch (error) {
            console.error("Candidate profile photo upload failed:", error);
            res.status(500).json({
                success: false,
                message: "Could not save the profile photo. Please try again.",
            });
        }
    });
    app.post("/api/auth/login", async (req, res) => {
        const login = req.body?.emailOrPhone;
        const password = req.body?.password;
        if (typeof login !== "string" ||
            !login.trim() ||
            typeof password !== "string" ||
            !password) {
            res.status(400).json({
                success: false,
                message: "Enter your email or phone number and password.",
            });
            return;
        }
        try {
            const candidates = await getCandidates();
            const normalizedLogin = login.trim();
            const candidate = normalizedLogin.includes("@")
                ? candidates.find((entry) => entry.email === normalizeEmail(normalizedLogin))
                : candidates.find((entry) => entry.phone === normalizePhone(normalizedLogin));
            if (!candidate ||
                !(await verifyPassword(password, candidate.passwordHash))) {
                res.status(401).json({
                    success: false,
                    message: "The email/phone or password is incorrect.",
                });
                return;
            }
            res.json({
                success: true,
                token: createToken(candidate.id),
                candidate: publicCandidate(candidate),
            });
        }
        catch (error) {
            console.error("Candidate login failed:", error);
            res.status(500).json({
                success: false,
                message: "Could not sign in. Please try again.",
            });
        }
    });
    app.get("/api/admin/users", async (req, res) => {
        const adminApiKey = process.env.ADMIN_API_KEY;
        const suppliedApiKey = req.header("x-admin-key");
        if (!adminApiKey || adminApiKey.length < 32) {
            res.status(503).json({
                success: false,
                message: "The registered-candidates directory is unavailable until ADMIN_API_KEY is configured.",
            });
            return;
        }
        if (!suppliedApiKey ||
            Buffer.byteLength(suppliedApiKey) !== Buffer.byteLength(adminApiKey) ||
            !timingSafeEqual(Buffer.from(suppliedApiKey), Buffer.from(adminApiKey))) {
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
        }
        catch (error) {
            console.error("Could not load the registered candidate directory:", error);
            res.status(500).json({
                success: false,
                message: "Could not load registered candidates.",
            });
        }
    });
}
//# sourceMappingURL=authRoutes.js.map