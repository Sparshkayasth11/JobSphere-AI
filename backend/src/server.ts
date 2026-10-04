import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Import resume agent logic
import { parseResumeText, calculateJobMatch } from "./resumeAgent.js";

type CreateOrderBody = {
  planName?: string;
  amount?: number;
};

type CoverLetterBody = {
  jobTitle?: unknown;
  company?: unknown;
};

type InterviewPrepBody = {
  jobTitle?: unknown;
  jobDescription?: unknown;
  candidateSkills?: unknown;
};

type InterviewFeedbackBody = {
  jobTitle?: unknown;
  question?: unknown;
  candidateAnswer?: unknown;
  questionNumber?: unknown;
};

type InterviewPrepQuestion = {
  type: "Technical" | "System Design" | "Behavioral";
  question: string;
  modelAnswer: string;
};

type InterviewNotificationBody = {
  candidateName?: unknown;
  candidateEmail?: unknown;
  jobTitle?: unknown;
  interviewDate?: unknown;
  interviewTime?: unknown;
  locationUrl?: unknown;
  interviewLocationUrl?: unknown;
  hrContactNumber?: unknown;
};

type PolishAnswerBody = {
  roughAnswer?: unknown;
  jobTitle?: unknown;
};

type SalaryBenchmarkBody = {
  jobTitle?: unknown;
  experienceYears?: unknown;
  location?: unknown;
  skills?: unknown;
};

type SalaryBenchmark = {
  minLpa: number;
  maxLpa: number;
  insights: string[];
};

type ApplyJobBody = {
  jobId?: unknown;
  jobTitle?: unknown;
  company?: unknown;
  candidateName?: unknown;
  email?: unknown;
  coverLetter?: unknown;
};

type AppliedCandidate = {
  id: string;
  jobId: string;
  candidateName: string;
  email: string;
  jobTitle: string;
  company: string;
  matchScore: string;
  status: "Applied";
  appliedAt: string;
  coverLetter: string;
  resumeUrl: string;
};

const backendDirectory = dirname(fileURLToPath(import.meta.url));
const uploadsDirectory = resolve(backendDirectory, "../uploads");
mkdirSync(uploadsDirectory, { recursive: true });
const appliedCandidates: AppliedCandidate[] = [];

const salaryRoleBenchmarks = [
  { matches: /\b(ai|machine learning|ml|data scientist)\b/i, category: "AI and machine learning", min: 5.5, max: 9 },
  { matches: /\b(devops|site reliability|sre|cloud|platform)\b/i, category: "Cloud and DevOps", min: 5.5, max: 9 },
  { matches: /\b(data analyst|business analyst|analytics)\b/i, category: "Data analytics", min: 4, max: 6.5 },
  { matches: /\b(design|ux|ui)\b/i, category: "product design", min: 4, max: 7 },
  { matches: /\b(qa|test|quality assurance)\b/i, category: "quality assurance", min: 3.5, max: 6 },
  { matches: /\b(android|ios|mobile|flutter)\b/i, category: "mobile development", min: 4.5, max: 7 },
  { matches: /\b(backend|back-end|node(?:\.js)?|express|java|python)\b/i, category: "backend development", min: 4.5, max: 7.5 },
  { matches: /\b(frontend|front-end|react|web developer)\b/i, category: "frontend development", min: 4.5, max: 7.5 },
];

function calculateSalaryBenchmark(
  jobTitle: string,
  experienceYears: number,
  location: string,
  skills: string[],
): SalaryBenchmark {
  const normalizedTitle = jobTitle.toLowerCase();
  const normalizedSkills = skills.join(" ").toLowerCase();
  const roleAndSkills = `${normalizedTitle} ${normalizedSkills}`;
  const roleBenchmark =
    salaryRoleBenchmarks.find((benchmark) =>
      benchmark.matches.test(roleAndSkills),
    ) ?? { min: 4, max: 7, category: "technology" };
  let experienceMultiplier = 1;
  if (experienceYears >= 7) experienceMultiplier = 2.1;
  else if (experienceYears >= 4) experienceMultiplier = 1.65;
  else if (experienceYears >= 2) experienceMultiplier = 1.3;
  else if (experienceYears >= 1) experienceMultiplier = 1.12;
  if (/\b(intern|internship)\b/i.test(normalizedTitle)) {
    experienceMultiplier = 0.55;
  }

  const normalizedLocation = location.toLowerCase();
  const locationMultiplier =
    /\b(remote|bangalore|bengaluru|hyderabad|gurgaon|gurugram)\b/.test(
      normalizedLocation,
    )
      ? 1.12
      : /\b(pune|mumbai|delhi|noida|chennai)\b/.test(normalizedLocation)
        ? 1.06
        : 1;
  const skillPremium =
    (/\b(node(?:\.js)?|express|react|typescript|python|java)\b/i.test(
      normalizedSkills,
    )
      ? 0.05
      : 0) +
    (/\b(aws|azure|gcp|docker|kubernetes|terraform)\b/i.test(normalizedSkills)
      ? 0.08
      : 0);
  const totalMultiplier = experienceMultiplier * locationMultiplier * (1 + skillPremium);
  const minLpa = Number((roleBenchmark.min * totalMultiplier).toFixed(1));
  const maxLpa = Number((roleBenchmark.max * totalMultiplier).toFixed(1));
  const insights = [
    `Demand for ${roleBenchmark.category} roles remains strong across India.`,
    /\b(aws|azure|gcp|docker|kubernetes|terraform)\b/i.test(normalizedSkills)
      ? "Your listed cloud and DevOps skills can strengthen your compensation potential."
      : "Adding cloud or DevOps skills such as AWS or Docker may improve your compensation potential.",
  ];

  return { minLpa, maxLpa, insights };
}

function getResumeCandidateName(resumeText: string, originalFilename: string): string {
  const excludedLine = /\b(resume|curriculum vitae|contact|email|phone|objective|summary|education|experience|skills)\b/i;
  const candidateName = resumeText
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .find(
      (line) =>
        line.length <= 60 &&
        /^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3}$/.test(line) &&
        !excludedLine.test(line),
    );

  if (candidateName) return candidateName;
  const filenameName = originalFilename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return filenameName || "Candidate";
}

function getRecommendedRoles(skills: string[]): string[] {
  const skillSet = new Set(skills.map((skill) => skill.toLowerCase()));
  const hasFrontend = ["react", "next.js", "javascript", "typescript", "html", "css"]
    .some((skill) => skillSet.has(skill));
  const hasBackend = ["node.js", "express", "python", "java", "sql", "mongodb"]
    .some((skill) => skillSet.has(skill));
  const roles: string[] = [];

  if (hasFrontend && hasBackend) roles.push("Full Stack Developer");
  if (hasBackend) roles.push("Backend Engineer");
  if (hasFrontend) roles.push("Frontend Developer");
  if (skillSet.has("machine learning") || skillSet.has("python")) {
    roles.push("Machine Learning Engineer");
  }
  if (skillSet.has("aws") || skillSet.has("docker")) {
    roles.push("Cloud / DevOps Engineer");
  }

  return roles.length > 0 ? [...new Set(roles)].slice(0, 4) : ["Software Developer"];
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// =========================
// MIDDLEWARE & MULTER SETUP
// =========================

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDirectory));

// File upload setup using memory buffer
const upload = multer({ storage: multer.memoryStorage() });
const applyResumeUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDirectory),
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = extname(file.originalname).toLowerCase();
    if (extension !== ".pdf" && extension !== ".docx") {
      callback(new Error("Resume must be a PDF or DOCX file."));
      return;
    }
    callback(null, true);
  },
});

// =========================
// HEALTH CHECK ROUTE
// =========================

app.get("/", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "JobSphere AI Backend is running 🚀",
  });
});

// =========================
// RAZORPAY ORDER API
// =========================

app.post("/api/create-order", (
  req: Request<Record<string, never>, unknown, CreateOrderBody>,
  res: Response,
) => {
  const { planName, amount } = req.body;
  
  // Mock order response for checkout
  res.json({
    success: true,
    orderId: "order_mock_" + Date.now(),
    amount: amount || 49900,
    currency: "INR",
    key: "rzp_test_YourTestKeyHere",
  });
});

// =========================
// JOB DATA
// =========================

const jobs = [
  {
    id: 1,
    company: "TechNova Solutions",
    title: "Junior Software Developer",
    location: "Bhopal, Madhya Pradesh",
    type: "Full-time",
    salary: "₹4.5 – 7 LPA",
    skills: ["JavaScript", "React", "Node.js"],
  },
  {
    id: 2,
    company: "DataSphere AI",
    title: "AI / ML Intern",
    location: "Bhopal, Madhya Pradesh",
    type: "Internship",
    salary: "₹15K – 25K / month",
    skills: ["Python", "Machine Learning", "SQL"],
  },
  {
    id: 3,
    company: "CodeCraft Technologies",
    title: "Frontend Developer",
    location: "Indore, Madhya Pradesh",
    type: "Full-time",
    salary: "₹5 – 8 LPA",
    skills: ["React", "Next.js", "TypeScript"],
  },
];

// Memory storage for applied jobs
const appliedJobsMap: { [jobId: number]: boolean } = {};

// GET APPLIED JOBS API
app.get("/api/applications", (_req: Request, res: Response) => {
  const appliedIds = Object.keys(appliedJobsMap)
    .filter((id) => appliedJobsMap[Number(id)])
    .map(Number);

  res.json({
    success: true,
    appliedJobIds: appliedIds,
  });
});

// APPLY JOB API
app.post("/api/jobs/:id/apply", (
  req: Request<{ id: string }>,
  res: Response,
) => {
  const jobId = Number(req.params.id);

  if (!Number.isInteger(jobId) || jobId < 1) {
    res.status(400).json({ success: false, message: "Invalid job ID" });
    return;
  }

  appliedJobsMap[jobId] = true;

  res.json({
    success: true,
    message: `Successfully applied to job #${jobId}`,
    appliedJobIds: Object.keys(appliedJobsMap).map(Number),
  });
});

const handleAppliedResumeUpload: express.RequestHandler = (req, res, next) => {
  applyResumeUpload.single("resume")(req, res, (error: unknown) => {
    if (error) {
      const message =
        error instanceof Error ? error.message : "Resume upload failed.";
      res.status(400).json({ success: false, message });
      return;
    }
    next();
  });
};

app.post(
  "/api/apply-job",
  handleAppliedResumeUpload,
  (
    req: Request<Record<string, never>, unknown, ApplyJobBody>,
    res: Response,
  ) => {
    const jobId = typeof req.body?.jobId === "string" ? req.body.jobId.trim() : "";
    const jobTitle =
      typeof req.body?.jobTitle === "string" ? req.body.jobTitle.trim() : "";
    const company =
      typeof req.body?.company === "string" ? req.body.company.trim() : "";
    const candidateName =
      typeof req.body?.candidateName === "string"
        ? req.body.candidateName.trim()
        : "";
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const coverLetter =
      typeof req.body?.coverLetter === "string" ? req.body.coverLetter.trim() : "";

    if (
      !jobId ||
      !jobTitle ||
      jobTitle.length > 120 ||
      !company ||
      company.length > 120 ||
      !candidateName ||
      candidateName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !req.file
    ) {
      if (req.file) {
        try {
          unlinkSync(req.file.path);
        } catch (error) {
          console.error("Failed to remove invalid uploaded resume:", error);
        }
      }
      res.status(400).json({
        success: false,
        message:
          "Valid candidate details, job details, and a PDF or DOCX resume are required.",
      });
      return;
    }

    const candidate: AppliedCandidate = {
      id: randomUUID(),
      jobId,
      candidateName,
      email,
      jobTitle,
      company,
      matchScore: "—",
      status: "Applied",
      appliedAt: new Date().toISOString(),
      coverLetter,
      resumeUrl: `${(
        process.env.PUBLIC_API_BASE_URL || `http://localhost:${PORT}`
      ).replace(/\/+$/, "")}/uploads/${encodeURIComponent(req.file.filename)}`,
    };
    appliedCandidates.unshift(candidate);
    if (/^\d+$/.test(jobId)) {
      appliedJobsMap[Number(jobId)] = true;
    }

    res.status(201).json({ success: true, candidate });
  },
);

app.get("/api/admin/candidates", (_req: Request, res: Response) => {
  res.json({ success: true, candidates: appliedCandidates });
});

// =========================
// JOB SEARCH API
// =========================

app.get("/api/jobs", (req: Request, res: Response) => {
  const search = String(req.query.search || "").trim().toLowerCase();
  const location = String(req.query.location || "").trim().toLowerCase();

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      !search ||
      job.title.toLowerCase().includes(search) ||
      job.company.toLowerCase().includes(search) ||
      job.skills.some((skill) => skill.toLowerCase().includes(search));

    const matchesLocation =
      !location || job.location.toLowerCase().includes(location);

    return matchesSearch && matchesLocation;
  });

  res.json({
    success: true,
    count: filteredJobs.length,
    jobs: filteredJobs,
  });
});

app.post(
  "/api/ai-salary-benchmark",
  (
    req: Request<Record<string, never>, unknown, SalaryBenchmarkBody>,
    res: Response,
  ) => {
    const jobTitle =
      typeof req.body?.jobTitle === "string" ? req.body.jobTitle.trim() : "";
    const location =
      typeof req.body?.location === "string" ? req.body.location.trim() : "";
    const experienceYears = req.body?.experienceYears;
    const skills = req.body?.skills;
    const skillNames = Array.isArray(skills)
      ? skills.filter((skill): skill is string => typeof skill === "string")
      : [];

    if (
      !jobTitle ||
      jobTitle.length > 120 ||
      !location ||
      location.length > 120 ||
      typeof experienceYears !== "number" ||
      !Number.isFinite(experienceYears) ||
      experienceYears < 0 ||
      experienceYears > 50 ||
      !Array.isArray(skills) ||
      skills.length > 40 ||
      skillNames.length !== skills.length ||
      skillNames.some((skill) => skill.length > 80)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Provide a job title, location, experience from 0 to 50 years, and a valid skills list.",
      });
      return;
    }

    const benchmark = calculateSalaryBenchmark(
      jobTitle,
      experienceYears,
      location,
      skillNames,
    );
    const minLpa = benchmark.minLpa.toFixed(1);
    const maxLpa = benchmark.maxLpa.toFixed(1);

    res.json({
      success: true,
      formattedRange: `₹${minLpa} LPA - ₹${maxLpa} LPA`,
      minLpa,
      maxLpa,
      insights: benchmark.insights,
    });
  },
);

// =========================
// COVER LETTER DRAFT API
// =========================

app.post("/api/generate-cover-letter", (
  req: Request<Record<string, never>, unknown, CoverLetterBody>,
  res: Response,
) => {
  const jobTitle =
    typeof req.body?.jobTitle === "string" ? req.body.jobTitle.trim() : "";
  const company =
    typeof req.body?.company === "string" ? req.body.company.trim() : "";

  if (!jobTitle || !company) {
    res.status(400).json({
      success: false,
      message: "Both jobTitle and company are required.",
    });
    return;
  }

  const coverLetter = `Dear Hiring Manager,

I am writing to express my interest in the ${jobTitle} position at ${company}. I am enthusiastic about the opportunity to contribute to your team and apply my skills to meaningful work.

My experience has helped me build strong problem-solving, communication, and collaboration skills. I am eager to bring a thoughtful, dependable approach to this role while continuing to learn and grow with ${company}.

Thank you for considering my application. I would welcome the opportunity to discuss how my background and enthusiasm could contribute to your team.

Sincerely,
[Your Name]`;

  res.json({ success: true, coverLetter });
});

app.post(
  "/api/generate-interview-prep",
  (
    req: Request<Record<string, never>, unknown, InterviewPrepBody>,
    res: Response,
  ) => {
    const jobTitle =
      typeof req.body?.jobTitle === "string" ? req.body.jobTitle.trim() : "";
    const jobDescription =
      typeof req.body?.jobDescription === "string"
        ? req.body.jobDescription.trim()
        : "";
    const candidateSkills = Array.isArray(req.body?.candidateSkills)
      ? req.body.candidateSkills.filter(
          (skill): skill is string => typeof skill === "string",
        )
      : [];

    if (!jobTitle || !jobDescription) {
      res.status(400).json({
        success: false,
        message: "Both jobTitle and jobDescription are required.",
      });
      return;
    }

    const skillList = candidateSkills.slice(0, 8);
    const skillFocus = skillList.length
      ? skillList.join(", ")
      : "the skills most relevant to this role";
    const questions: InterviewPrepQuestion[] = [
      {
        type: "Technical",
        question: `Which technical skills or tools from ${skillFocus} are most relevant to the ${jobTitle} role, and how have you applied them?`,
        modelAnswer: `Choose one or two skills that match the role requirements. Briefly explain the problem, how you used the tools, the decisions you made, and the measurable outcome. Connect your example to the responsibilities described for this ${jobTitle} position.`,
      },
      {
        type: "Technical",
        question: `Describe a challenging technical problem related to ${jobTitle} that you have solved. How did you investigate and verify your solution?`,
        modelAnswer: "Explain the context, the symptoms, and how you narrowed down the cause. Describe the solution and the tests or measurements you used to verify it. Close with what you learned or would improve next time.",
      },
      {
        type: "System Design",
        question: `How would you design a reliable, scalable solution for a core problem that someone in a ${jobTitle} role might own?`,
        modelAnswer: "Start by clarifying users, requirements, and constraints. Outline the main components and data flow, then discuss scale, failure handling, security, and observability. State trade-offs explicitly and explain what you would validate first.",
      },
      {
        type: "Behavioral",
        question: "Tell me about a time you had to learn an unfamiliar tool or concept quickly to deliver a result.",
        modelAnswer: "Use the STAR structure: describe the situation and goal, the learning steps you took, and how you applied the new knowledge. End with the result and evidence that the work succeeded.",
      },
      {
        type: "Behavioral",
        question: "Describe a time you received critical feedback or disagreed with a teammate. How did you respond?",
        modelAnswer: "Give a specific example, explain how you listened and clarified the concern, and describe the action you took. Share the outcome and what the experience changed about how you collaborate.",
      },
    ];

    res.json({
      success: true,
      questions,
      personalization: {
        jobTitle,
        candidateSkills: skillList,
        descriptionProvided: jobDescription.length > 0,
      },
    });
  },
);

app.post(
  "/api/ai-interview-feedback",
  (
    req: Request<Record<string, never>, unknown, InterviewFeedbackBody>,
    res: Response,
  ) => {
    const jobTitle =
      typeof req.body?.jobTitle === "string" ? req.body.jobTitle.trim() : "";
    const question =
      typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const candidateAnswer =
      typeof req.body?.candidateAnswer === "string"
        ? req.body.candidateAnswer.trim()
        : "";
    const questionNumber =
      typeof req.body?.questionNumber === "number" &&
      Number.isInteger(req.body.questionNumber) &&
      req.body.questionNumber > 0
        ? req.body.questionNumber
        : 1;

    if (!jobTitle || !question || candidateAnswer.length < 5) {
      res.status(400).json({
        success: false,
        message: "Job title, question, and a complete candidate answer are required.",
      });
      return;
    }

    const answerWordCount = candidateAnswer.split(/\s+/).length;
    const score =
      answerWordCount >= 45 ? 8.5 : answerWordCount >= 20 ? 7.5 : 6.5;
    const feedback = {
      score,
      whatWentWell:
        answerWordCount >= 20
          ? "You provided a relevant response with enough detail to explain your approach."
          : "You addressed the question directly and established a clear starting point.",
      improvementTip:
        "Strengthen your answer with a specific production example, the actions you personally took, and a measurable result. Explain the trade-offs and how you verified the outcome.",
    };
    const nextQuestions = [
      `For a ${jobTitle} application, how would you investigate a slow API that is affecting users in production?`,
      `How do you decide what to monitor and alert on for a critical ${jobTitle} service?`,
      `Tell me about a technical decision you made for work relevant to ${jobTitle}. What trade-offs did you consider?`,
      `How would you improve the reliability of a system you inherited in this ${jobTitle} role?`,
      `Describe how you would communicate and coordinate a high-priority production fix as a ${jobTitle}.`,
    ];
    const nextQuestion =
      nextQuestions[(questionNumber - 1) % nextQuestions.length];

    res.json({
      success: true,
      feedback,
      nextQuestion,
    });
  },
);

app.post(
  "/api/ai-polish-answer",
  (
    req: Request<Record<string, never>, unknown, PolishAnswerBody>,
    res: Response,
  ) => {
    const roughAnswer =
      typeof req.body?.roughAnswer === "string"
        ? req.body.roughAnswer.trim()
        : "";
    const jobTitle =
      typeof req.body?.jobTitle === "string" ? req.body.jobTitle.trim() : "";

    if (!roughAnswer || !jobTitle) {
      res.status(400).json({
        success: false,
        message: "Both roughAnswer and jobTitle are required.",
      });
      return;
    }
    if (roughAnswer.length > 3000) {
      res.status(400).json({
        success: false,
        message: "Please keep your answer under 3,000 characters.",
      });
      return;
    }

    const thinkingAboutExplanation =
      /\bsoch\s+raha(?:\s+hu)?\b|\bexplain(?:ing)?\b|\bhow\s+to\s+express\b|\bexpress(?:ing)?\s+(?:my|the|these)\s+(?:thoughts|ideas|approach)\b/i.test(
        roughAnswer,
      );
    const backendToolsMentioned =
      /\bbackend\b|\bnode(?:\.js)?\b|\bexpress(?:\.js)?\b/i.test(roughAnswer);

    const result = {
      success: true,
      polishedAnswer: thinkingAboutExplanation
        ? `For the ${jobTitle} role, I approach complex technical challenges by breaking down the core architectural logic, explaining the database and API workflows clearly, and highlighting practical performance optimizations.`
        : backendToolsMentioned
          ? "I designed and optimized scalable server-side architectures using Node.js and Express, focusing on low-latency RESTful APIs and robust error handling."
          : `For the ${jobTitle} role, I communicate my approach clearly, explain the reasoning behind my decisions, and connect my work to practical outcomes.`,
      vocabularyUsed: [
        "Architectural Logic",
        "RESTful APIs",
        "Low-Latency Execution",
      ],
      tip: `For a ${jobTitle} interview, briefly explain the context, your individual contribution, and the measurable outcome.`,
    };

    res.json(result);
  },
);

// Simulate delivery until an email provider is configured.
const sendInterviewEmail = (
  req: Request<Record<string, never>, unknown, InterviewNotificationBody>,
  res: Response,
) => {
    const {
      candidateName,
      candidateEmail,
      jobTitle,
      interviewDate,
      interviewTime,
      locationUrl: requestedLocationUrl,
      interviewLocationUrl,
      hrContactNumber,
    } = req.body ?? {};
    const interviewUrl = requestedLocationUrl ?? interviewLocationUrl;

    if (
      typeof candidateName !== "string" ||
      !candidateName.trim() ||
      typeof candidateEmail !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail) ||
      typeof jobTitle !== "string" ||
      !jobTitle.trim() ||
      typeof interviewDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(interviewDate) ||
      typeof interviewTime !== "string" ||
      !/^\d{2}:\d{2}$/.test(interviewTime) ||
      typeof hrContactNumber !== "string" ||
      !/^[0-9+().\s-]{7,20}$/.test(hrContactNumber)
    ) {
      res.status(400).json({
        success: false,
        message: "Valid candidate and interview schedule details are required.",
      });
      return;
    }

    let locationUrl: URL;
    try {
      if (typeof interviewUrl !== "string") {
        throw new Error("Invalid URL");
      }
      locationUrl = new URL(interviewUrl);
    } catch {
      res.status(400).json({
        success: false,
        message: "A valid meeting or venue URL is required.",
      });
      return;
    }

    if (locationUrl.protocol !== "https:" && locationUrl.protocol !== "http:") {
      res.status(400).json({
        success: false,
        message: "Meeting or venue URL must use HTTP or HTTPS.",
      });
      return;
    }

    res.json({
      success: true,
      notification: "simulated",
      recipient: candidateEmail,
      message: `Interview schedule notification simulated for ${candidateName.trim()} (${jobTitle.trim()}).`,
    });
};

app.post("/api/send-interview-email", sendInterviewEmail);
app.post("/api/notifications/interview", sendInterviewEmail);

// =========================
// RESUME ANALYZER API (FAIL-SAFE)
// =========================

const analyzeResumeUpload = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No resume file provided." });
      return;
    }

    let resumeText = req.file.buffer.toString("utf-8");
    if (
      req.file.mimetype === "application/pdf" ||
      req.file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      const pdfParser = new PDFParse({ data: req.file.buffer });
      try {
        const pdfData = await pdfParser.getText();
        if (pdfData.text) resumeText = pdfData.text;
      } finally {
        await pdfParser.destroy();
      }
    }

    const { extractedSkills } = parseResumeText(resumeText);
    const candidateName = getResumeCandidateName(
      resumeText,
      req.file.originalname,
    );
    const atsScore = Math.min(100, 60 + extractedSkills.length * 7);
    const matchingJobs = jobs.map((job) => ({
      jobId: job.id,
      matchPercentage: calculateJobMatch(extractedSkills, job.skills),
    }));
    const matchedJobs = jobs.map((job, index) => ({
      ...job,
      matchScore: matchingJobs[index]?.matchPercentage ?? 0,
    }));

    res.status(200).json({
      success: true,
      candidateName,
      extractedSkills,
      atsScore,
      recommendedRoles: getRecommendedRoles(extractedSkills),
      matchingJobs,
      userSkills: extractedSkills,
      totalSkillsFound: extractedSkills.length,
      jobs: matchedJobs,
    });
  } catch (error: unknown) {
    console.error("Resume analysis failed:", error);
    res.status(500).json({
      success: false,
      message: "Resume analysis failed. Please try another PDF or text resume.",
    });
  }
};

app.post("/api/resume/analyze", upload.single("resume"), analyzeResumeUpload);
app.post("/api/upload-resume", upload.single("resume"), analyzeResumeUpload);

// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
  console.log(`🚀 JobSphere AI Backend running on http://localhost:${PORT}`);
});