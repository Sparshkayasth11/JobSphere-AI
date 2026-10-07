"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import toast from 'react-hot-toast';

const API_BASE = "https://jobsphere-ai-zxkj.onrender.com";

function getCandidateResumeUrl(resumeUrl?: string): string | null {
  if (!resumeUrl || resumeUrl === "#") return null;

  try {
    const url = new URL(resumeUrl, API_BASE);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const pathSegments = url.pathname.split("/").filter(Boolean);
    const uploadsIndex = pathSegments.findIndex(
      (segment) => segment.toLowerCase() === "uploads",
    );
    const fileSegments =
      uploadsIndex >= 0
        ? pathSegments.slice(uploadsIndex + 1)
        : pathSegments;
    while (fileSegments[0]?.toLowerCase() === "uploads") {
      fileSegments.shift();
    }

    if (fileSegments.length === 0) return null;

    const cleanPath = fileSegments.join("/");
    return `${API_BASE}/uploads/${cleanPath}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function getSafeHttpUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function getInterviewPlatform(meetingLink: string): {
  name: string;
  playStoreUrl?: string;
} {
  try {
    const url = new URL(meetingLink);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "zoom.us" || hostname.endsWith(".zoom.us")) {
      return {
        name: "Zoom",
        playStoreUrl:
          "https://play.google.com/store/apps/details?id=us.zoom.videomeetings",
      };
    }
    if (hostname === "meet.google.com") {
      return {
        name: "Google Meet",
        playStoreUrl:
          "https://play.google.com/store/apps/details?id=com.google.android.apps.tachyon",
      };
    }
    if (
      hostname === "teams.microsoft.com" ||
      hostname.endsWith(".teams.microsoft.com") ||
      hostname === "teams.live.com"
    ) {
      return {
        name: "Microsoft Teams",
        playStoreUrl:
          "https://play.google.com/store/apps/details?id=com.microsoft.teams",
      };
    }
    if (
      hostname === "maps.google.com" ||
      (hostname.includes("google.") && url.pathname.toLowerCase().includes("/maps"))
    ) {
      return {
        name: "Google Maps",
        playStoreUrl:
          "https://play.google.com/store/apps/details?id=com.google.android.apps.maps",
      };
    }
  } catch {
    return { name: "Interview platform" };
  }

  return { name: "Interview platform" };
}

async function readApiJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `API ${response.url} returned a non-JSON response (HTTP ${response.status}). Verify the deployed frontend API URL and deployment.`,
    );
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(
      `API ${response.url} returned invalid JSON (HTTP ${response.status}).`,
    );
  }
}

async function fetchStartupApiJson(url: string): Promise<unknown> {
  const retryDelaysMs = [2000, 5000, 10000, 15000];
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      lastError = error;
      if (attempt === retryDelaysMs.length) break;
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelaysMs[attempt] ?? 0),
      );
      continue;
    }

    if (
      [404, 502, 503, 504].includes(response.status) &&
      attempt < retryDelaysMs.length
    ) {
      lastError = new Error(`Backend startup returned HTTP ${response.status}.`);
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelaysMs[attempt] ?? 0),
      );
      continue;
    }

    return readApiJson(response);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Unable to reach backend API at ${url}.`);
}

type Job = {
  id: string;
  company: string;
  title: string;
  description?: string;
  location: string;
  type: "Full-time" | "Part-time" | "Internship" | "Remote";
  salary: string;
  skills: string[];
  matchScore: number;
  postedDaysAgo: number;
};

type SalaryBenchmarkResult = {
  formattedRange: string;
  minLpa: string;
  maxLpa: string;
  insights: string[];
};

type ResumeAnalysisResult = {
  candidateName: string;
  extractedSkills: string[];
  atsScore: number;
  recommendedRoles: string[];
  matchingJobs: { jobId: number; matchPercentage: number }[];
};

function isResumeAnalysisResult(value: unknown): value is {
  success: true;
  candidateName: string;
  extractedSkills: string[];
  atsScore: number;
  recommendedRoles: string[];
  matchingJobs: { jobId: number; matchPercentage: number }[];
} {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    result.success === true &&
    typeof result.candidateName === "string" &&
    Array.isArray(result.extractedSkills) &&
    result.extractedSkills.every((skill) => typeof skill === "string") &&
    typeof result.atsScore === "number" &&
    Number.isFinite(result.atsScore) &&
    Array.isArray(result.recommendedRoles) &&
    result.recommendedRoles.every((role) => typeof role === "string") &&
    Array.isArray(result.matchingJobs) &&
    result.matchingJobs.every(
      (match) =>
        typeof match === "object" &&
        match !== null &&
        "jobId" in match &&
        typeof match.jobId === "number" &&
        "matchPercentage" in match &&
        typeof match.matchPercentage === "number",
    )
  );
}

function calculateSkillMatch(userSkills: string[], jobSkills: string[]): number {
  if (jobSkills.length === 0) return 70;
  const normalizedUserSkills = new Set(
    userSkills.map((skill) => skill.trim().toLowerCase()),
  );
  const matchedCount = jobSkills.filter((skill) =>
    normalizedUserSkills.has(skill.trim().toLowerCase()),
  ).length;
  return Math.round(40 + (matchedCount / jobSkills.length) * 60);
}

function isApplication(value: unknown): value is Application {
  if (typeof value !== "object" || value === null) return false;
  const application = value as Record<string, unknown>;
  return (
    (typeof application.id === "string" || typeof application.id === "number") &&
    typeof application.candidateName === "string" &&
    typeof application.email === "string" &&
    typeof application.jobTitle === "string" &&
    typeof application.matchScore === "string" &&
    (application.status === "Applied" ||
      application.status === "Shortlisted" ||
      application.status === "Rejected") &&
    typeof application.appliedAt === "string"
  );
}

function isSalaryBenchmarkResult(
  value: unknown,
): value is SalaryBenchmarkResult & { success: true } {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    result.success === true &&
    typeof result.formattedRange === "string" &&
    typeof result.minLpa === "string" &&
    typeof result.maxLpa === "string" &&
    Array.isArray(result.insights) &&
    result.insights.every((insight) => typeof insight === "string")
  );
}

const initialJobs: Job[] = [
  { id: "1", title: "Frontend Developer", company: "TechNova Solutions", location: "Bhopal, Madhya Pradesh", type: "Full-time", salary: "₹5–8 LPA", skills: ["React", "TypeScript", "CSS"], description: "Build accessible, responsive product interfaces with React and TypeScript; collaborate with design and API teams, and maintain component-level tests.", matchScore: 94, postedDaysAgo: 2 },
  { id: "2", title: "AI/ML Engineer Intern", company: "DataSphere AI", location: "Bhopal, Madhya Pradesh", type: "Internship", salary: "₹18K–28K / month", skills: ["Python", "Machine Learning", "SQL"], description: "Prepare and analyze datasets, prototype supervised-learning models in Python, and document evaluation results with guidance from the applied AI team.", matchScore: 89, postedDaysAgo: 1 },
  { id: "3", title: "Full Stack Developer", company: "CodeCraft Technologies", location: "Indore, Madhya Pradesh", type: "Full-time", salary: "₹6–10 LPA", skills: ["Next.js", "Node.js", "PostgreSQL"], description: "Deliver end-to-end product features using Next.js, Node.js, and PostgreSQL, including API integrations, schema changes, and automated tests.", matchScore: 86, postedDaysAgo: 3 },
  { id: "4", title: "Backend Developer", company: "Narmada Digital", location: "Jabalpur, Madhya Pradesh", type: "Full-time", salary: "₹5–9 LPA", skills: ["Java", "Spring Boot", "PostgreSQL"], description: "Develop Java and Spring Boot services, design REST endpoints, optimize PostgreSQL queries, and contribute to secure, maintainable backend releases.", matchScore: 82, postedDaysAgo: 4 },
  { id: "5", title: "DevOps Engineer", company: "CloudRoute Systems", location: "Bangalore, Karnataka", type: "Full-time", salary: "₹12–20 LPA", skills: ["AWS", "Docker", "Kubernetes"], description: "Operate AWS workloads, maintain Docker and Kubernetes deployment pipelines, and improve infrastructure monitoring, reliability, and release automation.", matchScore: 91, postedDaysAgo: 1 },
  { id: "6", title: "UI/UX Designer", company: "PixelMint Studio", location: "Pune, Maharashtra", type: "Full-time", salary: "₹7–12 LPA", skills: ["Figma", "Prototyping", "User Research"], description: "Translate user research into task flows, wireframes, and interactive Figma prototypes; partner with product and engineering through usability reviews.", matchScore: 84, postedDaysAgo: 5 },
  { id: "7", title: "Data Analyst", company: "InsightWorks", location: "Hyderabad, Telangana", type: "Full-time", salary: "₹6–10 LPA", skills: ["SQL", "Power BI", "Python"], description: "Query operational datasets with SQL and Python, build Power BI dashboards, and communicate trends and data-quality findings to business teams.", matchScore: 88, postedDaysAgo: 2 },
  { id: "8", title: "Android Developer", company: "AppOrbit", location: "Gurgaon, Haryana", type: "Full-time", salary: "₹8–14 LPA", skills: ["Kotlin", "Android", "REST APIs"], description: "Develop Kotlin-based Android features, integrate REST APIs, resolve defects, and support testing and release workflows across product teams.", matchScore: 79, postedDaysAgo: 6 },
  { id: "9", title: "QA Automation Engineer", company: "QualityStack", location: "Noida, Uttar Pradesh", type: "Full-time", salary: "₹7–11 LPA", skills: ["Playwright", "TypeScript", "API Testing"], description: "Create maintainable Playwright and TypeScript test suites, validate API contracts, triage regressions, and collaborate with engineers on release quality.", matchScore: 92, postedDaysAgo: 1 },
  { id: "10", title: "Remote Backend Engineer", company: "OpenBridge Labs", location: "Remote, India", type: "Remote", salary: "₹14–22 LPA", skills: ["Go", "Microservices", "AWS"], description: "Build Go services and versioned APIs for distributed systems, operate workloads on AWS, and contribute to service observability and incident reviews.", matchScore: 87, postedDaysAgo: 3 },
  { id: "11", title: "React Developer", company: "BrightLoop Technologies", location: "Bangalore, Karnataka", type: "Full-time", salary: "₹8–13 LPA", skills: ["React", "JavaScript", "Redux"], description: "Implement reusable React interfaces, manage shared client state with Redux, and work with design and API teams to ship tested product updates.", matchScore: 90, postedDaysAgo: 2 },
  { id: "12", title: "Python Backend Developer", company: "AsterByte", location: "Pune, Maharashtra", type: "Full-time", salary: "₹7–12 LPA", skills: ["Python", "Django", "Redis"], description: "Build Django APIs and background workflows, use Redis for caching and queues, and maintain database-backed services with automated tests.", matchScore: 85, postedDaysAgo: 7 },
  { id: "13", title: "Machine Learning Engineer", company: "NeuralSpring", location: "Hyderabad, Telangana", type: "Full-time", salary: "₹14–24 LPA", skills: ["Python", "PyTorch", "MLOps"], description: "Train and evaluate PyTorch models, package reproducible data and inference pipelines, and collaborate on monitoring and deployment practices for ML systems.", matchScore: 96, postedDaysAgo: 1 },
  { id: "14", title: "Product Designer (UI/UX)", company: "Northstar Product Co.", location: "Gurgaon, Haryana", type: "Full-time", salary: "₹10–16 LPA", skills: ["Figma", "Design Systems", "Accessibility"], description: "Own product flows from discovery to handoff, maintain Figma design-system components, and incorporate accessibility and usability findings into designs.", matchScore: 77, postedDaysAgo: 8 },
  { id: "15", title: "Junior Data Analyst", company: "MetricMind", location: "Indore, Madhya Pradesh", type: "Full-time", salary: "₹4–7 LPA", skills: ["Excel", "SQL", "Tableau"], description: "Clean and reconcile business data, write foundational SQL queries, and prepare Excel and Tableau reports with clear notes on assumptions.", matchScore: 83, postedDaysAgo: 4 },
  { id: "16", title: "iOS Developer", company: "BlueKite Mobility", location: "Bangalore, Karnataka", type: "Full-time", salary: "₹10–17 LPA", skills: ["Swift", "SwiftUI", "Core Data"], description: "Build Swift and SwiftUI app experiences, persist local data with Core Data, and contribute to accessibility, testing, and App Store release readiness.", matchScore: 81, postedDaysAgo: 3 },
  { id: "17", title: "Full Stack Engineer", company: "CivicTech India", location: "Bhopal, Madhya Pradesh", type: "Full-time", salary: "₹7–11 LPA", skills: ["React", "Node.js", "MongoDB"], description: "Deliver user-facing React features and Node.js APIs, model application data in MongoDB, and participate in code reviews and feature testing.", matchScore: 93, postedDaysAgo: 1 },
  { id: "18", title: "Cloud DevOps Associate", company: "InfraPilot", location: "Noida, Uttar Pradesh", type: "Full-time", salary: "₹8–13 LPA", skills: ["Azure", "Terraform", "CI/CD"], description: "Support Azure environments using Terraform, maintain CI/CD workflows, and assist with deployment troubleshooting, access controls, and infrastructure documentation.", matchScore: 74, postedDaysAgo: 9 },
  { id: "19", title: "Software QA Engineer", company: "Verity Software", location: "Pune, Maharashtra", type: "Full-time", salary: "₹5–9 LPA", skills: ["Selenium", "Java", "Jira"], description: "Design and execute Java-based Selenium tests, document defects in Jira, and coordinate regression coverage with developers and product stakeholders.", matchScore: 88, postedDaysAgo: 2 },
  { id: "20", title: "Frontend Engineering Intern", company: "LaunchPad Digital", location: "Remote, India", type: "Internship", salary: "₹20K–30K / month", skills: ["HTML", "CSS", "React"], description: "Contribute responsive React components using HTML and CSS, fix UI issues, and learn the team’s version-control, review, and testing practices.", matchScore: 68, postedDaysAgo: 5 },
  { id: "21", title: "Java Backend Engineer", company: "FinAxis Technologies", location: "Hyderabad, Telangana", type: "Full-time", salary: "₹10–16 LPA", skills: ["Java", "Spring Boot", "Kafka"], description: "Build Spring Boot services for transaction workflows, process asynchronous events with Kafka, and maintain API tests and production-ready documentation.", matchScore: 95, postedDaysAgo: 1 },
  { id: "22", title: "Data Visualization Analyst", company: "ClearView Analytics", location: "Gurgaon, Haryana", type: "Full-time", salary: "₹7–12 LPA", skills: ["SQL", "Tableau", "Data Modeling"], description: "Model reporting datasets with SQL, develop Tableau dashboards, and work with stakeholders to define consistent metrics and explain analytical results.", matchScore: 86, postedDaysAgo: 6 },
  { id: "23", title: "Flutter Mobile Developer", company: "PocketLabs", location: "Bangalore, Karnataka", type: "Full-time", salary: "₹8–14 LPA", skills: ["Flutter", "Dart", "Firebase"], description: "Create cross-platform mobile features in Flutter and Dart, integrate Firebase services, and support device testing and application-store releases.", matchScore: 90, postedDaysAgo: 3 },
  { id: "24", title: "Platform DevOps Engineer", company: "ScaleGrid Cloud", location: "Remote, India", type: "Remote", salary: "₹16–25 LPA", skills: ["Kubernetes", "Helm", "GCP"], description: "Maintain Kubernetes platforms and Helm charts on GCP, improve deployment automation, and partner with service teams on capacity and reliability.", matchScore: 98, postedDaysAgo: 1 },
  { id: "25", title: "UX Researcher", company: "HumanLayer", location: "Pune, Maharashtra", type: "Full-time", salary: "₹8–13 LPA", skills: ["User Research", "Usability Testing", "Figma"], description: "Plan interviews and usability studies, synthesize findings into research artifacts, and collaborate with product designers to validate proposed user flows.", matchScore: 73, postedDaysAgo: 10 },
  { id: "26", title: "Node.js API Developer", company: "RelayStack", location: "Noida, Uttar Pradesh", type: "Full-time", salary: "₹7–12 LPA", skills: ["Node.js", "Express", "MongoDB"], description: "Develop Express endpoints in Node.js, validate request data, integrate MongoDB persistence, and maintain API documentation and automated tests.", matchScore: 84, postedDaysAgo: 4 },
  { id: "27", title: "Computer Vision Intern", company: "VisionForge AI", location: "Bangalore, Karnataka", type: "Internship", salary: "₹25K–40K / month", skills: ["Python", "OpenCV", "PyTorch"], description: "Assist with image-data preparation, prototype OpenCV and PyTorch experiments, and report model evaluation results with reproducible notebooks.", matchScore: 91, postedDaysAgo: 2 },
  { id: "28", title: "Part-time Web Developer", company: "LocalWorks Digital", location: "Jabalpur, Madhya Pradesh", type: "Part-time", salary: "₹25K–40K / month", skills: ["WordPress", "JavaScript", "SEO"], description: "Maintain WordPress websites, implement small JavaScript enhancements, and apply technical SEO checks while coordinating updates with clients.", matchScore: 70, postedDaysAgo: 7 },
  { id: "29", title: "Business Data Analyst", company: "PrismPay", location: "Hyderabad, Telangana", type: "Full-time", salary: "₹9–15 LPA", skills: ["SQL", "Python", "Looker"], description: "Analyze business and product datasets with SQL and Python, build Looker reporting, and translate stakeholder questions into documented metrics.", matchScore: 87, postedDaysAgo: 3 },
  { id: "30", title: "React Native Developer", company: "UrbanFleet", location: "Gurgaon, Haryana", type: "Full-time", salary: "₹9–15 LPA", skills: ["React Native", "TypeScript", "GraphQL"], description: "Develop cross-platform React Native features in TypeScript, integrate GraphQL services, and support mobile testing, debugging, and release preparation.", matchScore: 80, postedDaysAgo: 5 },
  { id: "31", title: "Site Reliability Engineer", company: "SignalPeak", location: "Bangalore, Karnataka", type: "Full-time", salary: "₹18–28 LPA", skills: ["Linux", "Prometheus", "AWS"], description: "Support Linux-based services on AWS, build Prometheus monitoring, participate in incident response, and improve operational runbooks and service reliability.", matchScore: 94, postedDaysAgo: 2 },
  { id: "32", title: "Accessibility-focused UI Designer", company: "CommonGround Apps", location: "Remote, India", type: "Remote", salary: "₹9–14 LPA", skills: ["Figma", "WCAG", "Design Systems"], description: "Design inclusive product experiences in Figma, apply WCAG guidance to interaction patterns, and help teams maintain accessible design-system components.", matchScore: 78, postedDaysAgo: 8 },
  { id: "33", title: "Full Stack JavaScript Developer", company: "DevHarbor", location: "Indore, Madhya Pradesh", type: "Full-time", salary: "₹6–10 LPA", skills: ["React", "Node.js", "PostgreSQL"], description: "Build JavaScript product features across React and Node.js, work with PostgreSQL schemas, and contribute to API integration and regression testing.", matchScore: 89, postedDaysAgo: 1 },
  { id: "34", title: "QA Engineer - API Testing", company: "SecureTrail", location: "Noida, Uttar Pradesh", type: "Full-time", salary: "₹6–10 LPA", skills: ["Postman", "REST APIs", "Automation"], description: "Validate REST API behavior with Postman and automated checks, investigate defects, and maintain test cases for authentication and data workflows.", matchScore: 82, postedDaysAgo: 6 },
  { id: "35", title: "Generative AI Engineer", company: "PromptWorks India", location: "Pune, Maharashtra", type: "Full-time", salary: "₹15–26 LPA", skills: ["Python", "LLMs", "RAG"], description: "Develop Python-based LLM applications, evaluate retrieval-augmented generation workflows, and document data handling, quality checks, and integration decisions.", matchScore: 97, postedDaysAgo: 1 },
  { id: "36", title: "Data Analyst Intern", company: "GrowthLedger", location: "Bhopal, Madhya Pradesh", type: "Internship", salary: "₹15K–22K / month", skills: ["Excel", "SQL", "Power BI"], description: "Assist with spreadsheet and SQL data checks, prepare Power BI visuals, and summarize trends for review by the analytics team.", matchScore: 76, postedDaysAgo: 4 },
  { id: "37", title: "Backend Engineer - Go", company: "PacketBase", location: "Remote, India", type: "Remote", salary: "₹14–23 LPA", skills: ["Go", "PostgreSQL", "gRPC"], description: "Implement Go services and gRPC contracts, maintain PostgreSQL-backed workflows, and contribute to integration tests and distributed-service observability.", matchScore: 90, postedDaysAgo: 2 },
  { id: "38", title: "Mobile App Developer", company: "CareRoute Health", location: "Hyderabad, Telangana", type: "Full-time", salary: "₹8–13 LPA", skills: ["Kotlin", "Android", "Firebase"], description: "Build Kotlin Android features for health workflows, integrate Firebase services, and collaborate on privacy-conscious testing and app-release readiness.", matchScore: 85, postedDaysAgo: 7 },
  { id: "39", title: "Frontend UI Engineer", company: "CanvasCloud", location: "Pune, Maharashtra", type: "Full-time", salary: "₹9–15 LPA", skills: ["Vue.js", "TypeScript", "CSS"], description: "Create responsive Vue.js interfaces in TypeScript, maintain shared UI components, and collaborate with design and backend teams on feature delivery.", matchScore: 88, postedDaysAgo: 3 },
  { id: "40", title: "Machine Learning Research Associate", company: "DeepField Research", location: "Bangalore, Karnataka", type: "Full-time", salary: "₹12–20 LPA", skills: ["Python", "TensorFlow", "Statistics"], description: "Support experiments in Python and TensorFlow, analyze model results statistically, and maintain clear research notes and reproducible evaluation workflows.", matchScore: 93, postedDaysAgo: 5 },
  { id: "41", title: "Cloud Infrastructure Engineer", company: "MonsoonStack", location: "Gurgaon, Haryana", type: "Full-time", salary: "₹13–21 LPA", skills: ["AWS", "Terraform", "Linux"], description: "Provision AWS infrastructure with Terraform, administer Linux-based environments, and contribute to access management, monitoring, and recovery documentation.", matchScore: 86, postedDaysAgo: 2 },
  { id: "42", title: "Product Data Analyst", company: "LoopCart", location: "Noida, Uttar Pradesh", type: "Full-time", salary: "₹8–14 LPA", skills: ["SQL", "Python", "Experimentation"], description: "Analyze product funnels with SQL and Python, support experiment design and readouts, and communicate data limitations and findings to product teams.", matchScore: 92, postedDaysAgo: 1 },
  { id: "43", title: "Part-time QA Tester", company: "TestBench Studio", location: "Indore, Madhya Pradesh", type: "Part-time", salary: "₹20K–35K / month", skills: ["Manual Testing", "Jira", "Regression Testing"], description: "Run structured manual and regression tests, record reproducible issues in Jira, and verify fixes across supported browsers and devices.", matchScore: 67, postedDaysAgo: 9 },
  { id: "44", title: "iOS App Engineer", company: "FinchPay", location: "Pune, Maharashtra", type: "Full-time", salary: "₹12–19 LPA", skills: ["Swift", "UIKit", "REST APIs"], description: "Implement iOS application flows using Swift and UIKit, integrate REST APIs, and maintain UI tests and release documentation.", matchScore: 84, postedDaysAgo: 4 },
  { id: "45", title: "Full Stack Developer Intern", company: "BuildSprint", location: "Hyderabad, Telangana", type: "Internship", salary: "₹20K–32K / month", skills: ["React", "Express", "SQL"], description: "Contribute to React interfaces and Express endpoints, write basic SQL queries, and learn team workflows for testing, review, and delivery.", matchScore: 79, postedDaysAgo: 3 },
  { id: "46", title: "Python Data Engineer", company: "Lakehouse Labs", location: "Remote, India", type: "Remote", salary: "₹13–22 LPA", skills: ["Python", "Spark", "Airflow"], description: "Build Python and Spark data transformations, orchestrate scheduled pipelines with Airflow, and monitor data quality across analytical datasets.", matchScore: 96, postedDaysAgo: 1 },
  { id: "47", title: "Frontend Developer - Angular", company: "CobaltWorks", location: "Jabalpur, Madhya Pradesh", type: "Full-time", salary: "₹5–9 LPA", skills: ["Angular", "TypeScript", "RxJS"], description: "Develop Angular features in TypeScript, compose asynchronous flows with RxJS, and maintain responsive interfaces and unit-test coverage.", matchScore: 75, postedDaysAgo: 6 },
  { id: "48", title: "QA Automation Intern", company: "VerifyNow", location: "Bangalore, Karnataka", type: "Internship", salary: "₹18K–28K / month", skills: ["Cypress", "JavaScript", "Git"], description: "Assist with Cypress test automation in JavaScript, reproduce browser issues, and learn collaborative Git workflows and test reporting.", matchScore: 81, postedDaysAgo: 2 },
  { id: "49", title: "UI/UX Product Designer", company: "PeopleFirst Tech", location: "Bhopal, Madhya Pradesh", type: "Full-time", salary: "₹6–10 LPA", skills: ["Figma", "Interaction Design", "Prototyping"], description: "Map user journeys, prototype interaction patterns in Figma, and prepare clear specifications for product and engineering handoff.", matchScore: 87, postedDaysAgo: 5 },
  { id: "50", title: "Full Stack Software Engineer", company: "HorizonWare", location: "Remote, India", type: "Remote", salary: "₹16–26 LPA", skills: ["TypeScript", "Next.js", "AWS"], description: "Deliver TypeScript product features with Next.js, integrate application services, and support AWS deployment, code review, and production operations.", matchScore: 98, postedDaysAgo: 1 },
];

type ApiJob = {
  id: string | number;
  title: string;
  company: string;
  description?: string;
  location: string;
  type: string;
  salary: string;
  skills?: string[];
  matchScore?: number;
  match?: number;
  postedDaysAgo?: number;
  posted?: string;
};

type Application = {
  id: number | string;
  jobId?: string;
  candidateName: string;
  email: string;
  jobTitle: string;
  company?: string;
  matchScore: string;
  aiRecommendationStatus?: "approve" | "review" | "reject";
  aiRecommendationReason?: string;
  status: "Applied" | "Shortlisted" | "Rejected";
  appliedAt: string;
  extractedSkills?: string[];
  atsScore?: number;
  recommendedRoles?: string[];
  interviewDate?: string;
  interviewTime?: string;
  interviewLocationUrl?: string;
  hrContactNumber?: string;
  coverLetter?: string;
  resumeFile?: File;
  resumeUrl?: string;
};

function getCandidateRecommendation(candidate: Application): {
  status: "approve" | "review" | "reject";
  reason: string;
} {
  const parsedMatchScore = Number.parseFloat(candidate.matchScore);
  const computedStatus = !Number.isFinite(parsedMatchScore)
    ? "review"
    : parsedMatchScore >= 75
      ? "approve"
      : parsedMatchScore >= 50
        ? "review"
        : "reject";
  const status = Number.isFinite(parsedMatchScore)
    ? computedStatus
    : candidate.aiRecommendationStatus ?? computedStatus;

  return {
    status,
    reason:
      candidate.aiRecommendationReason ??
      (Number.isFinite(parsedMatchScore)
        ? `ATS match score is ${parsedMatchScore}%. ${
            status === "approve"
              ? "Recommended for shortlist."
              : status === "review"
                ? "Manual review recommended."
                : "Recommended for rejection."
          }`
        : "No ATS match score is available. Manual review required."),
  };
}

function AdminApplicantsTable({
  candidates,
  onShortlist,
  onDecision,
}: {
  candidates: Application[];
  onShortlist: (candidate: Application) => void;
  onDecision: (
    candidate: Application,
    status: "Shortlisted" | "Rejected",
  ) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | Application["status"]
  >("All");
  const [detailsCandidate, setDetailsCandidate] = useState<Application | null>(
    null,
  );
  const [summaryCandidate, setSummaryCandidate] =
    useState<Application | null>(null);

  const filteredCandidates = candidates.filter((candidate) => {
    const matchesStatus =
      statusFilter === "All" || candidate.status === statusFilter;
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !query ||
      candidate.candidateName.toLowerCase().includes(query) ||
      candidate.jobTitle.toLowerCase().includes(query) ||
      candidate.email.toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search candidates or roles..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-emerald-500 lg:w-80"
          />
          <div className="flex flex-wrap gap-2">
            {(["All", "Applied", "Shortlisted", "Rejected"] as const).map(
              (filter) => (
                <button
                  type="button"
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    statusFilter === filter
                      ? "border-emerald-700 bg-emerald-950 text-emerald-300"
                      : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
                  }`}
                >
                  {filter}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 shadow-xl">
          <table className="w-full min-w-[1440px] text-left text-sm text-zinc-300">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                  Candidate Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                  Applied Job
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                  Match Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                  AI Recommendation
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.map((candidate) => (
                <tr
                  key={candidate.id}
                  className="transition-colors hover:bg-zinc-800/30"
                >
                  <td className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60">
                    <div className="text-sm font-semibold text-zinc-100">
                      {candidate.candidateName}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {candidate.email}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60">
                    {candidate.jobTitle}
                  </td>
                  <td className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60 font-semibold text-emerald-300">
                    {candidate.matchScore}
                  </td>
                  <td className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60">
                    {(() => {
                      const recommendation =
                        getCandidateRecommendation(candidate);
                      const recommendationStyle =
                        recommendation.status === "approve"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          : recommendation.status === "review"
                            ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                            : "border-rose-500/20 bg-rose-500/10 text-rose-300";
                      const recommendationLabel =
                        recommendation.status === "approve"
                          ? "Recommend Approve"
                          : recommendation.status === "review"
                            ? "Needs Review"
                            : "Recommend Reject";

                      return (
                        <span
                          title={recommendation.reason}
                          aria-label={`AI recommendation: ${recommendationLabel}. ${recommendation.reason}`}
                          className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${recommendationStyle}`}
                        >
                          {recommendationLabel}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        candidate.status === "Shortlisted"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          : candidate.status === "Rejected"
                            ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
                            : "border-zinc-700 bg-zinc-800 text-zinc-300"
                      }`}
                    >
                      {candidate.status}
                    </span>
                  </td>
                  <td className="min-w-[500px] px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60">
                    <div className="flex flex-wrap items-center justify-start gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailsCandidate(candidate)}
                        className="px-2 py-1 text-xs font-medium text-zinc-400 transition-all hover:text-white"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setSummaryCandidate(candidate)}
                        className="px-2 py-1 text-xs font-medium text-zinc-400 transition-all hover:text-white"
                      >
                        View AI Summary
                      </button>
                      <a
                        href={getCandidateResumeUrl(candidate.resumeUrl) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-disabled={!getCandidateResumeUrl(candidate.resumeUrl)}
                        onClick={(event) => {
                          if (!getCandidateResumeUrl(candidate.resumeUrl)) {
                            event.preventDefault();
                          }
                        }}
                        className={`px-2 py-1 text-xs font-medium text-zinc-400 transition-all hover:text-white ${
                          getCandidateResumeUrl(candidate.resumeUrl)
                            ? ""
                            : "cursor-not-allowed opacity-40"
                        }`}
                      >
                        View Resume
                      </a>
                      <button
                        type="button"
                        onClick={() => onShortlist(candidate)}
                        className="px-3 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/30 transition-all"
                      >
                        Shortlist
                      </button>
                      <button
                        type="button"
                        onClick={() => onDecision(candidate, "Rejected")}
                        className="px-3 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/30 transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCandidates.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60 text-center text-zinc-500"
                  >
                    No candidates match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(detailsCandidate || summaryCandidate) && (
        <div className="fixed inset-0 z-[1300] grid place-items-center bg-black/80 p-5 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            className="relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-6 text-white shadow-2xl"
          >
            <button
              type="button"
              aria-label="Close candidate details"
              onClick={() => {
                setDetailsCandidate(null);
                setSummaryCandidate(null);
              }}
              className="absolute right-4 top-4 rounded-md border border-zinc-700 px-2 py-1 text-zinc-400 hover:text-white"
            >
              ✕
            </button>
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              {summaryCandidate ? "Recruiter AI Summary" : "Candidate Details"}
            </span>
            <h3 className="mt-2 pr-8 text-xl font-bold">
              {(summaryCandidate ?? detailsCandidate)?.candidateName}
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              {(summaryCandidate ?? detailsCandidate)?.jobTitle}
            </p>
            {summaryCandidate ? (
              <>
                {typeof summaryCandidate.atsScore === "number" ? (
                  <div className="mt-5 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4">
                    <strong className="text-3xl text-emerald-300">
                      {summaryCandidate.atsScore}
                    </strong>
                    <span className="ml-2 text-sm text-zinc-300">
                      /100 ATS Resume Score
                    </span>
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-zinc-500">
                    No ATS analysis is available for this candidate yet.
                  </p>
                )}
                <div className="mt-5">
                  <h4 className="mb-2 text-sm font-semibold text-zinc-200">
                    Parsed Candidate Strengths
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {summaryCandidate.extractedSkills?.length ? (
                      summaryCandidate.extractedSkills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-emerald-900 bg-emerald-950/60 px-3 py-1 text-xs text-emerald-200"
                        >
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-500">
                        No parsed skills are available.
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-5">
                  <h4 className="mb-2 text-sm font-semibold text-zinc-200">
                    Recommended Roles
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {summaryCandidate.recommendedRoles?.map((role) => (
                      <span
                        key={role}
                        className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-5 grid gap-3 text-sm text-zinc-300">
                <p>
                  <strong>Email:</strong> {detailsCandidate?.email}
                </p>
                <p>
                  <strong>Status:</strong> {detailsCandidate?.status}
                </p>
                <p>
                  <strong>Match score:</strong> {detailsCandidate?.matchScore}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

type MockInterviewFeedback = {
  score: number;
  whatWentWell: string;
  improvementTip: string;
};

type MockInterviewTurn = {
  question: string;
  candidateAnswer?: string;
  feedback?: MockInterviewFeedback;
};

type PolishedInterviewResult = {
  polishedAnswer: string;
  vocabularyUsed: string[];
  tip: string;
};

const normalizeJobs = (apiJobs: ApiJob[]): Job[] =>
  apiJobs.map((job) => {
    const postedDaysAgo = Number(
      job.postedDaysAgo ?? (job.posted ? Number.parseInt(job.posted, 10) : 0),
    );

    return {
      id: String(job.id),
      title: job.title,
      company: job.company,
      description: job.description,
      location: job.location,
      type:
        (["Full-time", "Part-time", "Internship", "Remote"] as const).find(
          (jobType) => jobType === job.type,
        ) ?? "Full-time",
      salary: job.salary,
      skills: job.skills ?? [],
      matchScore: Number(job.matchScore ?? job.match ?? 85),
      postedDaysAgo: Number.isFinite(postedDaysAgo) ? postedDaysAgo : 0,
    };
  });

export default function Home() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [searched, setSearched] = useState(false);

  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
const [isAdminView, setIsAdminView] = useState(false);
const [showAdminModal, setShowAdminModal] = useState(false);
const [adminPassword, setAdminPassword] = useState("");
const [applications, setApplications] = useState<Application[]>([]);
const [applicationJob, setApplicationJob] = useState<Job | null>(null);
const [applicantName, setApplicantName] = useState("");
const [applicantEmail, setApplicantEmail] = useState("");
const [applicantResume, setApplicantResume] = useState<File | null>(null);
const [submittingApplication, setSubmittingApplication] = useState(false);
const [schedulingApplication, setSchedulingApplication] = useState<Application | null>(null);
const [interviewDate, setInterviewDate] = useState("");
const [interviewTime, setInterviewTime] = useState("");
const [interviewLocationUrl, setInterviewLocationUrl] = useState("");
const [hrContactNumber, setHrContactNumber] = useState("");
const [sendingInterviewNotification, setSendingInterviewNotification] = useState(false);
const [selectedInterviewApplication, setSelectedInterviewApplication] =
  useState<Application | null>(null);
  // Resume Upload & AI Agent States
 const [isModalOpen, setIsModalOpen] = useState(false);
 const [uploading, setUploading] = useState(false);
 const [userSkills, setUserSkills] = useState<string[]>([]);
 const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysisResult | null>(null);
 const [selectedJob, setSelectedJob] = useState<Job | null>(null);
 const [salaryExperienceYears, setSalaryExperienceYears] = useState(2);
 const [salaryBenchmark, setSalaryBenchmark] = useState<SalaryBenchmarkResult | null>(null);
 const [salaryBenchmarkLoading, setSalaryBenchmarkLoading] = useState(false);
 const [salaryBenchmarkError, setSalaryBenchmarkError] = useState("");
 const salaryBenchmarkRequest = useRef<AbortController | null>(null);
 const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
 const [savedJobIds, setSavedJobIds] = useState<string[]>([]);
 const [savedJobsLoaded, setSavedJobsLoaded] = useState(false);
 const [statusFilter, setStatusFilter] = useState<string>("All");
 const [searchTerm, setSearchTerm] = useState("");
 const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
 const [selectedSummaryCandidate, setSelectedSummaryCandidate] = useState<Application | null>(null);
 const [applicationDataLoaded, setApplicationDataLoaded] = useState(false);
 const [coverLetter, setCoverLetter] = useState<string>('');
 const [isGeneratingCL, setIsGeneratingCL] = useState<boolean>(false);
 const [showCLModal, setShowCLModal] = useState<boolean>(false);
 const [interviewPrepJob, setInterviewPrepJob] = useState<Job | null>(null);
 const [activePrepTab, setActivePrepTab] = useState<"mock" | "english">("mock");
 const [mockInterviewTurns, setMockInterviewTurns] = useState<MockInterviewTurn[]>([]);
 const [mockInterviewAnswer, setMockInterviewAnswer] = useState("");
 const [mockInterviewLoading, setMockInterviewLoading] = useState(false);
 const [roughInterviewAnswer, setRoughInterviewAnswer] = useState("");
 const [polishedInterviewAnswer, setPolishedInterviewAnswer] = useState("");
  const [interviewVocabulary, setInterviewVocabulary] = useState<string[]>([]);
  const [interviewProTip, setInterviewProTip] = useState("");
 const [polishingInterviewAnswer, setPolishingInterviewAnswer] = useState(false);
 useEffect(() => {
  try {
    const savedJobIds = localStorage.getItem("appliedJobIds");
    const savedApplications = localStorage.getItem("applications");
    if (savedJobIds) {
      const parsedJobIds: unknown = JSON.parse(savedJobIds);
      if (Array.isArray(parsedJobIds)) {
        setAppliedJobIds(parsedJobIds.map(String));
      }
    }
    if (savedApplications) {
      const parsedApplications: unknown = JSON.parse(savedApplications);
      if (Array.isArray(parsedApplications)) {
        setApplications(parsedApplications as Application[]);
      }
    }
  } catch (err) {
    console.error("Failed to load saved applications:", err);
  } finally {
    setApplicationDataLoaded(true);
  }
}, []);

useEffect(() => {
  if (!applicationDataLoaded) return;
  try {
    localStorage.setItem("appliedJobIds", JSON.stringify(appliedJobIds));
    localStorage.setItem(
      "applications",
      JSON.stringify(applications, (key, value) =>
        key === "resumeFile" ? undefined : value,
      ),
    );
  } catch (err) {
    console.error("Failed to save applications locally:", err);
  }
}, [applicationDataLoaded, appliedJobIds, applications]);

useEffect(() => {
  try {
    const storedSavedJobIds = localStorage.getItem("savedJobIds");
    if (storedSavedJobIds) {
      const parsedSavedJobIds: unknown = JSON.parse(storedSavedJobIds);
      if (Array.isArray(parsedSavedJobIds)) {
        setSavedJobIds(
          [...new Set(parsedSavedJobIds.filter(
            (jobId): jobId is string => typeof jobId === "string",
          ))],
        );
      }
    }
  } catch (error) {
    console.error("Failed to load saved jobs:", error);
  } finally {
    setSavedJobsLoaded(true);
  }
}, []);

useEffect(() => {
  if (!savedJobsLoaded) return;
  try {
    localStorage.setItem("savedJobIds", JSON.stringify(savedJobIds));
  } catch (error) {
    console.error("Failed to save favorite jobs locally:", error);
  }
}, [savedJobsLoaded, savedJobIds]);

useEffect(() => {
  const loadAdminCandidates = async () => {
    try {
      const result = await fetchStartupApiJson(
        `${API_BASE}/api/admin/candidates`,
      );
      if (
        typeof result !== "object" ||
        result === null ||
        !("success" in result) ||
        result.success !== true ||
        !("candidates" in result) ||
        !Array.isArray(result.candidates)
      ) {
        throw new Error("Could not load candidates from the recruiter service.");
      }

      const candidates = result.candidates.filter(isApplication);
      setApplications((currentApplications) => {
        const knownIds = new Set(currentApplications.map((application) => String(application.id)));
        return [
          ...candidates.filter((candidate) => !knownIds.has(String(candidate.id))),
          ...currentApplications,
        ];
      });
    } catch (error) {
      console.warn("Failed to fetch recruiter candidates:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load recruiter data from the backend.",
        { id: "backend-unavailable" },
      );
    }
  };

  void loadAdminCandidates();
}, []);

const fetchSalaryBenchmark = async (job: Job, experienceYears: number) => {
  salaryBenchmarkRequest.current?.abort();
  const controller = new AbortController();
  salaryBenchmarkRequest.current = controller;
  setSalaryBenchmark(null);
  setSalaryBenchmarkError("");
  setSalaryBenchmarkLoading(true);

  try {
    const response = await fetch(`${API_BASE}/api/ai-salary-benchmark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        jobTitle: job.title,
        experienceYears,
        location: job.location,
        skills: job.skills,
      }),
    });
    const result: unknown = await response.json();

    if (!response.ok || !isSalaryBenchmarkResult(result)) {
      const message =
        typeof result === "object" &&
        result !== null &&
        "message" in result &&
        typeof result.message === "string"
          ? result.message
          : "The salary estimate response was invalid. Please try again.";
      throw new Error(message);
    }

    setSalaryBenchmark({
      formattedRange: result.formattedRange,
      minLpa: result.minLpa,
      maxLpa: result.maxLpa,
      insights: result.insights,
    });
  } catch (requestError) {
    if (controller.signal.aborted) return;
    console.error("Failed to fetch salary benchmark:", requestError);
    setSalaryBenchmarkError(
      requestError instanceof Error
        ? requestError.message
        : "Unable to load salary insights. Please try again.",
    );
  } finally {
    if (!controller.signal.aborted) {
      setSalaryBenchmarkLoading(false);
    }
  }
};

const handleViewJobDetails = (job: Job) => {
  setSelectedJob(job);
  void fetchSalaryBenchmark(job, salaryExperienceYears);
};

const handleCloseJobDetails = () => {
  salaryBenchmarkRequest.current?.abort();
  salaryBenchmarkRequest.current = null;
  setSelectedJob(null);
  setSalaryBenchmark(null);
  setSalaryBenchmarkError("");
};

const handleGenerateCoverLetter = async (jobTitle: string, company: string) => {
    setShowCLModal(true);
    setIsGeneratingCL(true);
    try {
    const res = await fetch(`${API_BASE}/api/generate-cover-letter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle, company }),
      });
      const data = await res.json();
      setCoverLetter(data.coverLetter || 'Failed to generate cover letter.');
    } catch (err) {
      console.error(err);
      setCoverLetter('Error connecting to AI service.');
    } finally {
      setIsGeneratingCL(false);
    }
  };

  const handleCopyCoverLetter = () => {
    navigator.clipboard.writeText(coverLetter);
    toast.success('Cover Letter copied to clipboard!');
  };

  const handlePrepareWithAI = (job: Job) => {
    setInterviewPrepJob(job);
    setActivePrepTab("mock");
    setRoughInterviewAnswer("");
    setPolishedInterviewAnswer("");
    setInterviewVocabulary([]);
    setInterviewProTip("");
    setMockInterviewTurns([
      {
        question: `Tell me how you manage state and handle API errors in production for ${job.title}?`,
      },
    ]);
    setMockInterviewAnswer("");
    setMockInterviewLoading(false);
  };

  const handlePolishInterviewAnswer = async () => {
    if (!interviewPrepJob || !roughInterviewAnswer.trim() || polishingInterviewAnswer) {
      return;
    }

    setPolishingInterviewAnswer(true);
    setPolishedInterviewAnswer("");
    setInterviewVocabulary([]);
    setInterviewProTip("");
    try {
      const response = await fetch(`${API_BASE}/api/ai-polish-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roughAnswer: roughInterviewAnswer.trim(),
          jobTitle: interviewPrepJob.title,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not polish your answer.");
      }
      setPolishedInterviewAnswer(data.polishedAnswer || "");
      setInterviewVocabulary(data.vocabularyUsed || []);
      setInterviewProTip(data.tip || "");
    } catch (error) {
      console.error("Failed to polish interview answer:", error);
      toast.error(error instanceof Error ? error.message : "Unable to polish your answer.");
    } finally {
      setPolishingInterviewAnswer(false);
    }
  };

  const handleCopyPolishedAnswer = async () => {
    try {
      await navigator.clipboard.writeText(polishedInterviewAnswer);
      toast.success("Professional answer copied.");
    } catch (error) {
      console.error("Failed to copy polished answer:", error);
      toast.error("Could not copy the answer to the clipboard.");
    }
  };

  const handleSubmitMockInterviewAnswer = async () => {
    const candidateAnswer = mockInterviewAnswer.trim();
    const currentTurn = mockInterviewTurns[mockInterviewTurns.length - 1];
    if (!interviewPrepJob || !currentTurn || !candidateAnswer || mockInterviewLoading) {
      return;
    }

    setMockInterviewLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/ai-interview-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: interviewPrepJob.title,
          question: currentTurn.question,
          candidateAnswer,
          questionNumber:
            mockInterviewTurns.filter((turn) => turn.candidateAnswer).length + 1,
        }),
      });
      const data = await response.json();
      if (
        !response.ok ||
        !data.success ||
        typeof data.feedback?.score !== "number" ||
        typeof data.nextQuestion !== "string"
      ) {
        throw new Error(data.message || "Could not evaluate your answer.");
      }

      setMockInterviewTurns((currentTurns) => [
        ...currentTurns.slice(0, -1),
        {
          ...currentTurn,
          candidateAnswer,
          feedback: data.feedback,
        },
        { question: data.nextQuestion },
      ]);
      setMockInterviewAnswer("");
    } catch (error) {
      console.error("Failed to evaluate mock interview answer:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to evaluate your answer. Please try again.",
      );
    } finally {
      setMockInterviewLoading(false);
    }
  };

  const [activeTab, setActiveTab] = useState<"all" | "applied" | "saved">("all");
  useEffect(() => {
  const fetchAppliedJobs = async () => {
    try {
      const data = await fetchStartupApiJson(`${API_BASE}/api/applications`);
      if (
        typeof data === "object" &&
        data !== null &&
        "success" in data &&
        data.success === true &&
        "appliedJobIds" in data &&
        Array.isArray(data.appliedJobIds)
      ) {
        const backendJobIds = data.appliedJobIds.map(String);
        setAppliedJobIds((prev) => [...new Set([...prev, ...backendJobIds])]);
      }
    } catch (err) {
      console.warn("Failed to load applied jobs:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Unable to load applied jobs from the backend.",
        { id: "backend-unavailable" },
      );
    }
  };

  fetchAppliedJobs();
}, []);
  const closeApplicationModal = () => {
    if (submittingApplication) return;
    setApplicationJob(null);
    setApplicantResume(null);
  };

  const submitJobApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!applicationJob || !applicantResume || submittingApplication) return;
    if (appliedJobIds.includes(applicationJob.id)) {
      toast.error("You have already applied for this job.");
      return;
    }

    setSubmittingApplication(true);
    const formData = new FormData();
    formData.append("jobId", applicationJob.id);
    formData.append("jobTitle", applicationJob.title);
    formData.append("company", applicationJob.company);
    formData.append("candidateName", applicantName.trim());
    formData.append("email", applicantEmail.trim());
    formData.append("coverLetter", coverLetter);
    formData.append("jobSkills", applicationJob.skills.join("|"));
    formData.append("resume", applicantResume);

    try {
      const response = await fetch(`${API_BASE}/api/apply-job`, {
        method: "POST",
        body: formData,
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("success" in result) ||
        result.success !== true ||
        !("candidate" in result) ||
        !isApplication(result.candidate) ||
        !result.candidate.resumeUrl
      ) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "message" in result &&
          typeof result.message === "string"
            ? result.message
            : "Your application could not be submitted. Please try again.";
        throw new Error(message);
      }

      const candidate = result.candidate;
      setApplications((current) => [
        candidate,
        ...current.filter((application) => application.id !== candidate.id),
      ]);
      setAppliedJobIds((current) =>
        current.includes(applicationJob.id)
          ? current
          : [...current, applicationJob.id],
      );
      setApplicationJob(null);
      setApplicantResume(null);
      setSelectedJob(null);
      toast.success(`Application submitted for ${applicationJob.title}.`);
    } catch (error) {
      console.error("Failed to submit job application:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Your application could not be submitted. Please try again.",
      );
    } finally {
      setSubmittingApplication(false);
    }
  };
const openInterviewScheduler = (application: Application) => {
  setInterviewDate(application.interviewDate ?? "");
  setInterviewTime(application.interviewTime ?? "");
  setInterviewLocationUrl(application.interviewLocationUrl ?? "");
  setHrContactNumber(application.hrContactNumber ?? "");
  setSchedulingApplication(application);
};
const updateCandidateDecision = async (
  candidate: Application,
  status: "Shortlisted" | "Rejected",
) => {
  try {
    let updatedCandidate: Application = { ...candidate, status };

    if (candidate.resumeUrl) {
      const response = await fetch(
        `${API_BASE}/api/admin/candidates/${encodeURIComponent(String(candidate.id))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("success" in result) ||
        result.success !== true ||
        !("candidate" in result) ||
        !isApplication(result.candidate)
      ) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "message" in result &&
          typeof result.message === "string"
            ? result.message
            : "The candidate decision could not be saved.";
        throw new Error(message);
      }
      updatedCandidate = result.candidate;
    }

    setApplications((current) =>
      current.map((application) =>
        application.id === candidate.id
          ? { ...application, ...updatedCandidate }
          : application,
      ),
    );
    toast.success(
      status === "Shortlisted"
        ? `${candidate.candidateName} approved.`
        : `${candidate.candidateName} rejected.`,
    );
  } catch (error) {
    console.error("Failed to update candidate decision:", error);
    toast.error(
      error instanceof Error
        ? error.message
        : "The candidate decision could not be saved.",
    );
  }
};
const saveInterviewSchedule = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (!schedulingApplication) return;

  let locationUrl: URL;
  try {
    locationUrl = new URL(interviewLocationUrl);
  } catch {
    toast.error("Enter a valid meeting or venue URL.");
    return;
  }
  if (
    locationUrl.protocol !== "https:" &&
    locationUrl.protocol !== "http:"
  ) {
    toast.error("Meeting or venue URL must use HTTP or HTTPS.");
    return;
  }

  const notificationToastId = "interview-notification";
  setSendingInterviewNotification(true);
  toast.loading("Sending interview notification...", {
    id: notificationToastId,
  });
  try {
    const notificationResponse = await fetch(
      `${API_BASE}/api/send-interview-email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateEmail: schedulingApplication.email,
          candidateName: schedulingApplication.candidateName,
          jobTitle: schedulingApplication.jobTitle,
          interviewDate,
          interviewTime,
          locationUrl: locationUrl.toString(),
          hrContactNumber: hrContactNumber.trim(),
        }),
      },
    );
    const notificationResult = await notificationResponse.json();
    if (!notificationResponse.ok || !notificationResult.success) {
      throw new Error(
        notificationResult.message || "Interview notification failed.",
      );
    }

    setApplications((prev) =>
      prev.map((application) =>
        application.id === schedulingApplication.id
          ? {
              ...application,
              status: "Shortlisted",
              interviewDate,
              interviewTime,
              interviewLocationUrl: locationUrl.toString(),
              hrContactNumber: hrContactNumber.trim(),
            }
          : application,
      ),
    );
    setSchedulingApplication(null);
    toast.success("Candidate shortlisted and notification sent.", {
      id: notificationToastId,
    });
  } catch (error) {
    console.error("Failed to notify candidate of interview:", error);
    toast.error(
      error instanceof Error
        ? error.message
        : "Unable to notify the candidate. Please try again.",
      { id: notificationToastId },
    );
  } finally {
    setSendingInterviewNotification(false);
  }
};
const filteredJobs = jobs.filter((job: any) => {
  const matchesTab =
    activeTab === "all"
      ? true
      : activeTab === "applied"
        ? appliedJobIds.includes(job.id)
        : savedJobIds.includes(job.id);

  const roleQuery = search ? search.toLowerCase().trim() : "";
  const locQuery = location ? location.toLowerCase().trim() : "";

  const matchesRole = !roleQuery ||
    job.title?.toLowerCase().includes(roleQuery) ||
    job.company?.toLowerCase().includes(roleQuery) ||
    (job.skills && job.skills.some((s: string) => s.toLowerCase().includes(roleQuery)));

  const jobLocation = job.location ? job.location.toLowerCase() : "";
  const matchesLoc = !locQuery || jobLocation.includes(locQuery);

  return matchesTab && matchesRole && matchesLoc;
});
const toggleSavedJob = (jobId: string) => {
  setSavedJobIds((currentSavedJobIds) =>
    currentSavedJobIds.includes(jobId)
      ? currentSavedJobIds.filter((savedJobId) => savedJobId !== jobId)
      : [...currentSavedJobIds, jobId],
  );
};
const displayedJobs = showAllJobs ? filteredJobs : filteredJobs.slice(0, 6);
const getMatchScore = (jobSkills: string[]) => {
  return calculateSkillMatch(userSkills, jobSkills);
};
const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  setUploading(true);
  const formData = new FormData();
  formData.append("resume", file);

  try {
   const res = await fetch(`${API_BASE}/api/upload-resume`, {
     method: "POST",
     body: formData,
   });

   const result: unknown = await res.json();
   if (!res.ok || !isResumeAnalysisResult(result)) {
     const message =
       typeof result === "object" &&
       result !== null &&
       "message" in result &&
       typeof result.message === "string"
         ? result.message
         : "Resume analysis failed. Please try again.";
     throw new Error(message);
   }

   const { candidateName, extractedSkills, atsScore, recommendedRoles, matchingJobs } =
     result;
   const matchingJobScores = new Map(
     matchingJobs.map(({ jobId, matchPercentage }) => [
       String(jobId),
       matchPercentage,
     ]),
   );
   setUserSkills(extractedSkills);
   setJobs((currentJobs) =>
     currentJobs.map((job) => {
       const matchedScore = matchingJobScores.get(job.id);
       return {
         ...job,
         matchScore:
           matchedScore ??
           calculateSkillMatch(extractedSkills, job.skills),
       };
     }),
   );

   const newApplication: Application = {
     id: `resume-${Date.now()}`,
     candidateName,
     email: "applicant@jobsphere.ai",
     jobTitle: recommendedRoles[0] ?? "Software Engineer Applicant",
     matchScore: `${Math.max(
       ...matchingJobs.map((match) => match.matchPercentage),
       0,
     )}%`,
     status: "Applied",
     appliedAt: new Date().toLocaleDateString(),
     coverLetter,
     extractedSkills,
     atsScore,
     recommendedRoles,
     resumeFile:
       file.type === "application/pdf" ||
       file.name.toLowerCase().endsWith(".pdf")
         ? file
         : undefined,
   };

   setApplications((current) => [newApplication, ...current]);
   setResumeAnalysis({
     candidateName,
     extractedSkills,
     atsScore,
     recommendedRoles,
     matchingJobs,
   });
   setIsModalOpen(false);
   toast.success("Resume analyzed successfully.");
 } catch (uploadError) {
   console.error("Resume upload error:", uploadError);
   toast.error(
     uploadError instanceof Error
       ? uploadError.message
       : "Resume analysis failed. Please try again.",
   );
 } finally {
   setUploading(false);
 }
};
  // Search Jobs API Handler
  const handleSearch = async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      const normalizedSearch = search.trim().toLowerCase();
      const normalizedLocation = location.trim().toLowerCase();

      if (normalizedSearch) {
        params.append("search", normalizedSearch);
      }

      if (normalizedLocation) {
        params.append("location", normalizedLocation);
      }

      const response = await fetch(
        `${API_BASE}/api/jobs?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch jobs");
      }

      const data = await response.json();

      if (data.success) {
        const formattedJobs = normalizeJobs(data.jobs);

        setJobs(formattedJobs);
        setSearched(true);
      } else {
        setError("Unable to fetch jobs.");
      }
    } catch (err) {
      console.error("Job search error:", err);
      setError(
        "Backend se connection nahi ho pa raha. Check karo backend server running hai."
      );
    } finally {
      setLoading(false);
    }
  };

  // Clear Search Handler
  const clearSearch = () => {
    setSearch("");
    setLocation("");
    setSearched(false);
    setError("");
    setJobs(initialJobs);
  };

  const candidates = applications;
  if (isAdminView) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto max-w-7xl space-y-6 p-8">
          <header className="flex items-center justify-between border-b border-zinc-800 pb-5">
            <h1 className="text-xl font-bold text-emerald-400">
              JobSphere AI — Recruiter Portal
            </h1>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsAdminView(false)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
              >
                Exit Admin View
              </button>
            </div>
          </header>

          <div className="space-y-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Recruiter Admin Dashboard
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Manage candidates, analyze ATS scores, and review resumes.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="min-w-40 rounded-xl border border-zinc-800 border-t-emerald-500/40 bg-zinc-900/80 p-4 shadow-lg">
                  <span className="text-xs text-zinc-400">
                    Total Applicants
                  </span>
                  <p className="mt-1 text-2xl font-bold text-emerald-400">
                    {candidates.length}
                  </p>
                </div>
                <div className="min-w-40 rounded-xl border border-zinc-800 border-t-emerald-500/40 bg-zinc-900/80 p-4 shadow-lg">
                  <span className="text-xs text-zinc-400">Shortlisted</span>
                  <p className="mt-1 text-2xl font-bold text-emerald-400">
                    {candidates.filter(
                      (candidate) => candidate.status === "Shortlisted",
                    ).length}
                  </p>
                </div>
              </div>
            </div>

            <AdminApplicantsTable
              candidates={candidates}
              onShortlist={openInterviewScheduler}
              onDecision={updateCandidateDecision}
            />
          </div>
        </div>

        {schedulingApplication && (
          <div className="fixed inset-0 z-[1200] grid place-items-center bg-black/80 p-5 backdrop-blur-sm">
            <form
              onSubmit={saveInterviewSchedule}
              className="grid w-full max-w-[460px] gap-4 rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-white"
            >
              <div>
                <h3 className="font-bold text-emerald-400">
                  Schedule interview
                </h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {schedulingApplication.candidateName} ·{" "}
                  {schedulingApplication.jobTitle}
                </p>
              </div>
              <label className="grid gap-1.5 text-sm">
                Interview date
                <input
                  type="date"
                  value={interviewDate}
                  onChange={(event) => setInterviewDate(event.target.value)}
                  required
                  className="rounded-md border border-zinc-700 bg-zinc-950 p-2.5"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                Interview time
                <input
                  type="time"
                  value={interviewTime}
                  onChange={(event) => setInterviewTime(event.target.value)}
                  required
                  className="rounded-md border border-zinc-700 bg-zinc-950 p-2.5"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                Meeting / Venue URL
                <input
                  type="url"
                  value={interviewLocationUrl}
                  onChange={(event) =>
                    setInterviewLocationUrl(event.target.value)
                  }
                  required
                  className="rounded-md border border-zinc-700 bg-zinc-950 p-2.5"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                HR contact number
                <input
                  type="tel"
                  value={hrContactNumber}
                  onChange={(event) => setHrContactNumber(event.target.value)}
                  required
                  className="rounded-md border border-zinc-700 bg-zinc-950 p-2.5"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={sendingInterviewNotification}
                  onClick={() => setSchedulingApplication(null)}
                  className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingInterviewNotification}
                  className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                >
                  {sendingInterviewNotification
                    ? "Sending..."
                    : "Save & Shortlist"}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    );
  }

  return (
    <main>
      {/* NAVBAR */}
      <nav className="navbar px-4 py-3 md:px-8">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4">
          <a href="#" className="logo">
            <span className="logo-mark">J</span>
            <span>
              Job<span>Sphere</span>
            </span>
            <small>AI</small>
          </a>

          <div className="hidden items-center gap-8 text-sm text-zinc-300 md:flex">
            <a href="#jobs">Find Jobs</a>
            <a href="#ai">AI Assistant</a>
            <a href="#how">How It Works</a>
            <a href="#about">About</a>
          </div>
          <div className="hidden shrink-0 items-center gap-3 md:flex">
            <a
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-md bg-green-500 px-3.5 py-1.5 text-sm font-bold text-black shadow-[0_0_10px_rgba(34,197,94,0.3)]"
            >
              ✨ Pro Plans
            </a>
            <div className="flex shrink-0 items-center gap-2">
              <button
                className="rounded-lg px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-zinc-800"
                onClick={() => setIsModalOpen(true)}
              >
                Upload Resume
              </button>
              <button className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-lime-200">
                Get Started
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowAdminModal(true)}
              className="whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-zinc-700"
            >
              🔒 Admin Access
            </button>
          </div>
          <button
            type="button"
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-lg leading-none text-white transition-colors hover:bg-zinc-700 md:hidden"
          >
            {isMobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
        {isMobileMenuOpen && (
          <div className="absolute left-0 right-0 top-full flex flex-col gap-4 border-b border-zinc-800 bg-zinc-900 p-6 text-white shadow-xl animate-in slide-in-from-top-2 md:hidden">
            <a
              href="#jobs"
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-sm text-zinc-200 hover:text-white"
            >
              Find Jobs
            </a>
            <a
              href="#ai"
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-sm text-zinc-200 hover:text-white"
            >
              AI Assistant
            </a>
            <a
              href="/pricing"
              onClick={() => setIsMobileMenuOpen(false)}
              className="rounded-lg bg-emerald-500 px-4 py-2.5 text-center text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
            >
              ✨ Pro Plans
            </a>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsModalOpen(true);
              }}
              className="rounded-lg border border-zinc-700 px-4 py-2.5 text-left text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Upload Resume
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setShowAdminModal(true);
              }}
              className="rounded-lg border border-zinc-700 px-4 py-2.5 text-left text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              🔒 Admin Access
            </button>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-glow glow-one" />
        <div className="hero-glow glow-two" />

        <div className="hero-container">
          <div className="hero-badge">
            <span className="pulse-dot" />
            Next-generation AI career orchestration
          </div>

          <h1>
            Find a job that
            <br />
            <span>fits you.</span>
          </h1>

          <p className="hero-description">
            Bring your skills and goals into focus. Explore relevant roles,
            understand how your experience aligns, and move from{" "}
            <strong>discovery to application with confidence.</strong>
          </p>

          {/* SEARCH BOX */}
          <div className="search-box">
            <div className="search-field">
              <div className="field-icon">
                <SearchIcon />
              </div>

              <div>
                <label>What are you looking for?</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch();
                    }
                  }}
                  placeholder="Job title, skill or company"
                />
              </div>
            </div>

            <div className="search-divider" />

            <div className="search-field location-field">
              <div className="field-icon">
                <LocationIcon />
              </div>

              <div>
                <label>Where?</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch();
                    }
                  }}
                  placeholder="City or remote"
                />
              </div>
            </div>

            <button
              className="search-button"
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading-spinner" />
                  Searching...
                </>
              ) : (
                <>
                  <SearchIcon />
                  Search Jobs
                </>
              )}
            </button>
          </div>

          <div className="popular">
            <span>Popular:</span>
            <button onClick={() => setSearch("Software Developer")}>
              Software Developer
            </button>
            <button onClick={() => setSearch("Python Developer")}>
              Python Developer
            </button>
            <button onClick={() => setSearch("AI / ML")}>AI / ML</button>
            <button onClick={() => setSearch("Internship")}>
              Internship
            </button>
          </div>
        </div>
      </section>

      {/* EXTRACTED RESUME SKILLS BANNER */}
      {userSkills.length > 0 && (
        <section style={{ maxWidth: "1100px", margin: "0 auto 30px", padding: "0 20px" }}>
          <div
            style={{
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              borderRadius: "16px",
              padding: "18px 24px",
              color: "#10b981",
              boxShadow: "0 10px 25px -5px rgba(16, 185, 129, 0.1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "15px", marginBottom: "10px" }}>
              <SparkIcon /> AI Extracted Skills from Resume:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {userSkills.map((skill, index) => (
                <span
                  key={index}
                  style={{
                    background: "rgba(16, 185, 129, 0.25)",
                    color: "#6ee7b7",
                    fontSize: "13px",
                    fontWeight: "600",
                    padding: "6px 14px",
                    borderRadius: "20px",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* STATS */}
      <section className="stats-section">
        <div className="stats-container">
          <div className="stat">
            <strong>50+</strong>
            <span>Curated sample role profiles</span>
          </div>

          <div className="stat">
            <strong>Skills-first</strong>
            <span>Role alignment insights</span>
          </div>

          <div className="stat">
            <strong>Actionable</strong>
            <span>Application guidance</span>
          </div>

          <div className="stat">
            <strong>AI-assisted</strong>
            <span>Career preparation tools</span>
          </div>
        </div>
      </section>

      {/* JOBS */}
      <section className="jobs-section" id="jobs">
        <div className="section-container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">OPPORTUNITIES · INDICATIVE RANGES</span>
              <h2>
                Relevant roles.
                <br />
                <span>Clearer next steps.</span>
              </h2>
            </div>
<div className="flex gap-4 my-6 border-b border-gray-800 pb-2">
  <button
    onClick={() => setActiveTab("all")}
    className={`px-4 py-2 font-medium rounded-lg transition-colors ${
      activeTab === "all"
        ? "bg-green-500/20 text-green-400 border border-green-500/30"
        : "text-gray-400 hover:text-white"
    }`}
  >
    All Jobs ({jobs.length})
  </button>
  <button
    onClick={() => setActiveTab("applied")}
    className={`px-4 py-2 font-medium rounded-lg transition-colors ${
      activeTab === "applied"
        ? "bg-green-500/20 text-green-400 border border-green-500/30"
        : "text-gray-400 hover:text-white"
    }`}
  >
    Applied Jobs ({appliedJobIds.length})
  </button>
  <button
    onClick={() => setActiveTab("saved")}
    className={`px-4 py-2 font-medium rounded-lg transition-colors ${
      activeTab === "saved"
        ? "bg-green-500/20 text-green-400 border border-green-500/30"
        : "text-gray-400 hover:text-white"
    }`}
  >
    Saved Jobs ({savedJobIds.length})
  </button>
</div>
            <button
              className="view-all"
              onClick={() => setShowAllJobs((showingAll) => !showingAll)}
            >
              {showAllJobs ? "Show less" : "View all jobs"} <ArrowIcon />
            </button>
          </div>

          {/* SEARCH RESULT */}
          {searched && (
            <div className="search-result-banner">
              <div>
                <span className="result-dot" />
                Showing {jobs.length} opportunities
                {search ? ` for "${search}"` : ""}
                {location ? ` in ${location}` : ""}
              </div>
              <button onClick={clearSearch}>Clear</button>
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div className="search-error">
              <span>⚠</span>
              {error}
            </div>
          )}

          {/* NO RESULTS */}
          {!loading && !error && filteredJobs.length === 0 && (
            <div className="flex flex-col items-center justify-center p-12 my-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl text-center">
              <p className="text-xl font-semibold text-zinc-200">
                No matching jobs found
              </p>
              <p className="text-sm text-zinc-400 mt-1">
                Try adjusting your search terms or location filter.
              </p>
              <button
                onClick={() => {
                  setSearch("");
                  setLocation("");
                  setSearched(false);
                  setError("");
                  setJobs(initialJobs);
                  setShowAllJobs(false);
                }}
                className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg transition"
              >
                Clear Filters
              </button>
            </div>
          )}

          {/* JOB GRID */}
       {filteredJobs.length > 0 && (
            <div className="job-grid">
             {displayedJobs.map((job) => (
                <article className="job-card" key={job.id}>
                  <div className="job-card-top">
      {(() => {
  const app = applications.find((application) => application.jobId === job.id);
  const status = app ? app.status : (appliedJobIds.includes(job.id) ? "Applied" : null);

  if (!status) return null;

  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: "600",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        backgroundColor:
          status === "Shortlisted"
            ? "rgba(16, 185, 129, 0.25)"
            : status === "Rejected"
            ? "rgba(239, 68, 68, 0.25)"
            : "rgba(16, 185, 129, 0.2)",
        color:
          status === "Shortlisted"
            ? "#34d399"
            : status === "Rejected"
            ? "#f87171"
            : "#10b981",
        border:
          status === "Shortlisted"
            ? "1px solid #10b981"
            : status === "Rejected"
            ? "1px solid #ef4444"
            : "1px solid rgba(16, 185, 129, 0.4)",
      }}
    >
      {status === "Shortlisted" && "✓ Shortlisted"}
      {status === "Rejected" && "✕ Rejected"}
      {status === "Applied" && "✓ Applied"}
    </span>
  );
})()}
                    <div className="company-logo">
                      {job.company
                        .split(" ")
                        .map((word) => word[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>

                    <button
                      className={`save-btn ${
                        savedJobIds.includes(job.id) ? "is-saved" : ""
                      }`}
                      type="button"
                      aria-label={
                        savedJobIds.includes(job.id)
                          ? `Remove ${job.title} from saved jobs`
                          : `Save ${job.title}`
                      }
                      aria-pressed={savedJobIds.includes(job.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleSavedJob(job.id);
                      }}
                    >
                      <HeartIcon filled={savedJobIds.includes(job.id)} />
                    </button>
                  </div>

                  <div className="company-name">{job.company}</div>

                  <h3>{job.title}</h3>

                  <div className="job-location">
                    <LocationIcon />
                    {job.location}
                  </div>

                  <div className="job-meta">
                    <span>{job.type}</span>
                    <span>{job.salary}</span>
                  </div>

                  <div className="skills">
                    {job.skills.map((skill) => (
                      <span key={skill}>{skill}</span>
                    ))}
                  </div>

                  <div className="job-footer">
                    <div className="match">
                      <div className="match-ring">
                     <span>{userSkills.length > 0 ? getMatchScore(job.skills || []) : job.matchScore}%</span>
                      </div>

                      <div>
                        <strong>AI Match</strong>
                        <small>{job.postedDaysAgo === 0 ? "Posted today" : `${job.postedDaysAgo} days ago`}</small>
                      </div>
                    </div>

                    <button
                      className="details-btn"
                      onClick={() => handleViewJobDetails(job)}
                    >
                      View Job <ArrowIcon />
                    </button>
                  </div>
                  <button
                    className="prepare-interview-button"
                    onClick={() => handlePrepareWithAI(job)}
                  >
                    ✨ Prepare with AI
                  </button>
                  {(() => {
                      const application = applications.find(
                        (candidateApplication) =>
                          candidateApplication.jobId === job.id,
                      );
                      if (
                        application?.status !== "Shortlisted" ||
                        !application.interviewDate ||
                        !application.interviewTime ||
                        !application.interviewLocationUrl
                      ) {
                        return null;
                      }

                      const platform = getInterviewPlatform(
                        application.interviewLocationUrl,
                      );
                      const formattedInterviewDate = new Date(
                        `${application.interviewDate}T00:00:00`,
                      ).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      });

                      return (
                        <section className="interview-details" aria-label="Interview confirmed">
                          <h4>Interview Confirmed</h4>
                          <p><strong>Date:</strong> {formattedInterviewDate}</p>
                          <p><strong>Time:</strong> {application.interviewTime}</p>
                          {application.hrContactNumber && (
                            <p>
                              <strong>HR Contact:</strong>{" "}
                              <a href={`tel:${application.hrContactNumber}`}>
                                {application.hrContactNumber}
                              </a>
                            </p>
                          )}
                          <p><strong>Platform:</strong> {platform.name}</p>
                          <button
                            type="button"
                            className="help-center-button"
                            onClick={() =>
                              setSelectedInterviewApplication(application)
                            }
                          >
                            Interview Details
                          </button>
                          <a
                            className="help-center-button"
                            href={application.interviewLocationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Join Interview / View Location
                          </a>
                          <a
                            className="help-center-button"
                            href={`mailto:support@jobsphere.ai?subject=${encodeURIComponent(`Interview help: ${job.title}`)}`}
                          >
                            Contact Help Center
                          </a>
                        </section>
                      );
                    })()}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* AI SECTION */}
      <section className="ai-section" id="ai">
        <div className="ai-card">
          <div className="ai-grid" />

          <div className="ai-content">
            <div className="ai-icon">
              <SparkIcon />
            </div>

            <span className="eyebrow">MEET YOUR AI CAREER ASSISTANT</span>

            <h2>
              Stop searching.
              <br />
              <span>Start matching.</span>
            </h2>

            <p>
            Describe your goals in plain language. JobSphere helps you review
            your profile, explore relevant roles, compare listed skills, and
            prepare stronger, more focused applications.
            </p>

            <button className="ai-button" onClick={() => setIsModalOpen(true)}>
              <SparkIcon />
              Upload Resume for AI Match
              <ArrowIcon />
            </button>
          </div>

          <div className="chat-preview">
            <div className="chat-header">
              <div className="ai-avatar">
                <SparkIcon />
              </div>

              <div>
                <strong>JobSphere AI</strong>
                <span>
                  <i /> Online
                </span>
              </div>
            </div>

            <div className="chat-body">
              <div className="message user-message">
                Find fresher Python jobs in Bhopal.
              </div>

              <div className="message ai-message">
                <span className="mini-ai">
                  <SparkIcon />
                </span>
                Here are roles aligned with your search. This AI/ML internship
                is a <strong>sample match</strong> based on the skills in your
                profile.
              </div>

              <div className="mini-job">
                <div className="mini-company">DS</div>

                <div>
                  <strong>AI / ML Intern</strong>
                  <span>DataSphere AI · Bhopal</span>
                </div>

                <b>Match</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how-section" id="how">
        <div className="section-container">
          <div className="center-heading">
            <span className="eyebrow">HOW IT WORKS</span>

            <h2>
              Your next opportunity,
              <br />
              <span>in three steps.</span>
            </h2>
          </div>

          <div className="steps">
            <div className="step">
              <div className="step-number">01</div>
              <h3>AI Profile &amp; Resume Parsing</h3>
              <p>
                Extract key skills, experience level, and domain expertise
                automatically using intelligent document analysis.
              </p>
            </div>

            <div className="step">
              <div className="step-number">02</div>
              <h3>Smart Skill &amp; Gap Matching</h3>
              <p>
                Compare applicant profiles against real-time job requisitions and
                highlight key areas of skill alignment.
              </p>
            </div>

            <div className="step">
              <div className="step-number">03</div>
              <h3>Automated Tailored Applications</h3>
              <p>
                Generate contextual AI cover letters and direct application
                insights for seamless submissions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer id="about">
        <div className="footer-container">
          <div className="logo footer-logo">
            <span className="logo-mark">J</span>
            <span>
              Job<span>Sphere</span>
            </span>
            <small>AI</small>
          </div>

          <p>Next-Generation AI Career Orchestration Platform.</p>

          <span className="copyright">
            © 2026 JobSphere AI. Intelligent tools for a more focused job search.
          </span>
        </div>
      </footer>

      {applicationJob && (
        <div className="application-modal-overlay">
          <form
            className="application-modal"
            onSubmit={submitJobApplication}
            aria-labelledby="application-modal-title"
          >
            <button
              type="button"
              className="application-modal-close"
              aria-label="Close application form"
              onClick={closeApplicationModal}
              disabled={submittingApplication}
            >
              ✕
            </button>
            <span className="eyebrow">JOB APPLICATION</span>
            <h2 id="application-modal-title">Apply for {applicationJob.title}</h2>
            <p className="application-modal-subtitle">
              {applicationJob.company} · {applicationJob.location}
            </p>

            <label className="application-field">
              Full name
              <input
                type="text"
                value={applicantName}
                onChange={(event) => setApplicantName(event.target.value)}
                autoComplete="name"
                maxLength={120}
                required
                disabled={submittingApplication}
              />
            </label>
            <label className="application-field">
              Email address
              <input
                type="email"
                value={applicantEmail}
                onChange={(event) => setApplicantEmail(event.target.value)}
                autoComplete="email"
                maxLength={254}
                required
                disabled={submittingApplication}
              />
            </label>
            <label className="application-field">
              Resume (PDF or DOCX, up to 10 MB)
              <input
                type="file"
                accept=".pdf,.docx"
                required
                disabled={submittingApplication}
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0] ?? null;
                  if (
                    selectedFile &&
                    !/\.(pdf|docx)$/i.test(selectedFile.name)
                  ) {
                    toast.error("Please select a PDF or DOCX resume.");
                    event.target.value = "";
                    setApplicantResume(null);
                    return;
                  }
                  if (selectedFile && selectedFile.size > 10 * 1024 * 1024) {
                    toast.error("Resume files must be 10 MB or smaller.");
                    event.target.value = "";
                    setApplicantResume(null);
                    return;
                  }
                  setApplicantResume(selectedFile);
                }}
              />
            </label>
            {applicantResume && (
              <p className="application-file-name">
                Selected: {applicantResume.name}
              </p>
            )}
            <div className="application-modal-actions">
              <button
                type="button"
                className="application-cancel-button"
                onClick={closeApplicationModal}
                disabled={submittingApplication}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="application-submit-button"
                disabled={submittingApplication || !applicantResume}
              >
                {submittingApplication ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RESUME UPLOAD MODAL */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#141a26",
              border: "1px solid #1f2937",
              borderRadius: "20px",
              padding: "28px",
              maxWidth: "450px",
              width: "100%",
              position: "relative",
              color: "#ffffff",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            }}
          >
            <button
              onClick={() => setIsModalOpen(false)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                color: "#9ca3af",
                fontSize: "20px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  color: "#10b981",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                }}
              >
                <SparkIcon />
              </div>
              <h3 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 6px" }}>
                Upload Resume
              </h3>
              <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0 }}>
                Upload your PDF or TXT resume to auto-extract skills & calculate live AI Job Match Scores.
              </p>
            </div>

            <label
              style={{
                border: "2px dashed #374151",
                borderRadius: "16px",
                padding: "36px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: uploading ? "not-allowed" : "pointer",
                backgroundColor: "#0b0f17",
                transition: "border-color 0.2s",
              }}
            >
              <span style={{ fontSize: "28px", marginBottom: "8px" }}>📄</span>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#e5e7eb" }}>
                {uploading ? "Analyzing Resume with AI Agent..." : "Click to select file"}
              </span>
              <span style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                Supports PDF or TXT
              </span>
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleResumeUpload}
                disabled={uploading}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>
      )}
      {/* Admin Password Modal */}
{showAdminModal && (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "grid", placeItems: "center", zIndex: 100 }}>
    <div style={{ background: "#18181b", padding: "24px", borderRadius: "12px", border: "1px solid #27272a", width: "320px" }}>
      <h3 style={{ color: "#fff", marginBottom: "12px" }}>Admin Password Required</h3>
      <input 
        type="password" 
        placeholder="Enter Admin Key" 
        value={adminPassword}
        onChange={(e) => setAdminPassword(e.target.value)}
        style={{ width: "100%", padding: "10px", borderRadius: "6px", background: "#09090b", color: "#fff", border: "1px solid #3f3f46", marginBottom: "12px" }}
      />
      <div style={{ display: "flex", gap: "8px" }}>
        <button 
          onClick={() => {
            if (adminPassword === "Sparsh@123") {
              setIsAdminView(true);
              setShowAdminModal(false);
              setAdminPassword("");
            } else {
              alert("Incorrect Admin Password!");
            }
          }}
          style={{ flex: 1, padding: "10px", background: "#10b981", color: "#000", fontWeight: "bold", borderRadius: "6px", border: "none", cursor: "pointer" }}
        >
          Login
        </button>
        <button 
          onClick={() => setShowAdminModal(false)}
          style={{ padding: "10px", background: "#27272a", color: "#fff", borderRadius: "6px", border: "none", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}

{/* Admin Applications View */}
{isAdminView && (
  <div className="mx-auto my-8 max-w-7xl space-y-5 rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-white">
    <h2 style={{ color: "#10b981", marginBottom: "16px" }}>👑 Recruiter Admin Dashboard</h2>
    <p style={{ color: "#a1a1aa", marginBottom: "20px" }}>Total Applicants: {applications.length}</p>
    
{/* Search Bar & Status Filter Layout */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", gap: "15px" }}>
        {/* Search Input */}
        <input
          type="text"
          placeholder="Search candidate name or job..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            border: "1px solid #3f3f46",
            background: "#18181b",
            color: "#fff",
            fontSize: "14px",
            outline: "none",
            width: "300px",
          }}
        />

        {/* Status Filter Tabs */}
        <div style={{ display: "flex", gap: "10px" }}>
          {["All", "Applied", "Shortlisted", "Rejected"].map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "1px solid #3f3f46",
                background: statusFilter === filter ? "#10b981" : "#27272a",
                color: statusFilter === filter ? "#000" : "#fff",
                fontWeight: "bold",
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 shadow-xl">
      <table className="w-full min-w-[1000px] text-left">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">Candidate</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">Applied Job</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">Match Score</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">Actions</th>
          </tr>
        </thead>
        <tbody>
          {applications
            .filter((app) => {
              const matchesStatus = statusFilter === "All" || app.status === statusFilter;
              const matchesSearch =
                app.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                app.jobTitle.toLowerCase().includes(searchTerm.toLowerCase());
              return matchesStatus && matchesSearch;
            })
          .map((app) => (
              <tr key={app.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60">
                  {app.candidateName}<br/>
                  <span style={{ fontSize: "12px", color: "#71717a" }}>{app.email}</span>
                </td>
                <td className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60">{app.jobTitle}</td>
                <td className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60 font-bold text-emerald-400">{app.matchScore}</td>
                <td className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60">
                  <span className={`rounded-md px-2 py-1 text-xs ${
                    app.status === "Shortlisted"
                      ? "bg-emerald-950 text-emerald-300"
                      : app.status === "Rejected"
                        ? "bg-rose-950 text-rose-300"
                        : "bg-zinc-800 text-zinc-300"
                  }`}>
                    {app.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-zinc-200 border-b border-zinc-800/60">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setSelectedCandidate(app)}
                      className="px-2 py-1 text-xs font-medium text-zinc-400 transition-all hover:text-white"
                    >
                      Details
                    </button>
                    <button
                      onClick={() => setSelectedSummaryCandidate(app)}
                      className="px-2 py-1 text-xs font-medium text-zinc-400 transition-all hover:text-white"
                    >
                      View AI Summary
                    </button>
                    <a
                      href={getCandidateResumeUrl(app.resumeUrl) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!getCandidateResumeUrl(app.resumeUrl)}
                      onClick={(event) => {
                        if (!getCandidateResumeUrl(app.resumeUrl)) {
                          event.preventDefault();
                          toast.error("No uploaded resume is available for this candidate.");
                        }
                      }}
                      className={`px-2 py-1 text-xs font-medium text-zinc-400 transition-all hover:text-white ${
                        getCandidateResumeUrl(app.resumeUrl)
                          ? ""
                          : "cursor-not-allowed opacity-40"
                      }`}
                    >
                      View Resume
                    </a>
                    <button
                      onClick={() => openInterviewScheduler(app)}
                      className="px-3 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/30 transition-all"
                    >
                      Shortlist
                    </button>
                    <button
                      onClick={() => {
                        setApplications((prev) =>
                          prev.map((a) => (a.id === app.id ? { ...a, status: "Rejected" } : a))
                        );
                      }}
                      className="px-3 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/30 transition-all"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
    </table>
    </div>
  </div>
)}
{schedulingApplication && (
  <div
    role="presentation"
    onClick={(event) => {
      if (event.target === event.currentTarget) setSchedulingApplication(null);
    }}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 1100,
      display: "grid",
      placeItems: "center",
      padding: "20px",
      background: "rgba(0, 0, 0, 0.8)",
    }}
  >
    <form
      onSubmit={saveInterviewSchedule}
      aria-labelledby="interview-scheduler-title"
      style={{
        width: "100%",
        maxWidth: "460px",
        display: "grid",
        gap: "14px",
        padding: "24px",
        border: "1px solid #3f3f46",
        borderRadius: "12px",
        background: "#18181b",
        color: "#fff",
      }}
    >
      <div>
        <h3 id="interview-scheduler-title" style={{ margin: 0, color: "#10b981" }}>
          Schedule interview
        </h3>
        <p style={{ margin: "6px 0 0", color: "#a1a1aa", fontSize: "14px" }}>
          {schedulingApplication.candidateName} · {schedulingApplication.jobTitle}
        </p>
      </div>
      <label style={{ display: "grid", gap: "6px", fontSize: "14px" }}>
        Interview date
        <input
          type="date"
          value={interviewDate}
          onChange={(event) => setInterviewDate(event.target.value)}
          required
          style={{ padding: "10px", borderRadius: "6px", border: "1px solid #3f3f46", background: "#09090b", color: "#fff" }}
        />
      </label>
      <label style={{ display: "grid", gap: "6px", fontSize: "14px" }}>
        Interview time
        <input
          type="time"
          value={interviewTime}
          onChange={(event) => setInterviewTime(event.target.value)}
          required
          style={{ padding: "10px", borderRadius: "6px", border: "1px solid #3f3f46", background: "#09090b", color: "#fff" }}
        />
      </label>
      <label style={{ display: "grid", gap: "6px", fontSize: "14px" }}>
        Meeting / Venue URL (Zoom, Google Meet, Teams, Maps)
        <input
          type="url"
          value={interviewLocationUrl}
          onChange={(event) => setInterviewLocationUrl(event.target.value)}
          placeholder="https://zoom.us/... or meeting / venue link"
          required
          style={{ padding: "10px", borderRadius: "6px", border: "1px solid #3f3f46", background: "#09090b", color: "#fff" }}
        />
      </label>
      <label style={{ display: "grid", gap: "6px", fontSize: "14px" }}>
        HR contact number
        <input
          type="tel"
          value={hrContactNumber}
          onChange={(event) => setHrContactNumber(event.target.value)}
          pattern="[0-9+() .-]{7,20}"
          title="Enter a valid contact number (7 to 20 digits or phone symbols)."
          placeholder="+1 555 123 4567"
          required
          style={{ padding: "10px", borderRadius: "6px", border: "1px solid #3f3f46", background: "#09090b", color: "#fff" }}
        />
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
        <button
          type="button"
          disabled={sendingInterviewNotification}
          onClick={() => setSchedulingApplication(null)}
          style={{ padding: "9px 14px", borderRadius: "6px", border: "1px solid #3f3f46", background: "#27272a", color: "#fff", cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={sendingInterviewNotification}
          style={{ padding: "9px 14px", borderRadius: "6px", border: "none", background: sendingInterviewNotification ? "#6b7280" : "#10b981", color: "#000", fontWeight: "bold", cursor: sendingInterviewNotification ? "wait" : "pointer" }}
        >
          {sendingInterviewNotification ? "Sending..." : "Save & Shortlist"}
        </button>
      </div>
    </form>
  </div>
)}
      {selectedInterviewApplication &&
        (() => {
          const application = selectedInterviewApplication;
          const meetingLink = getSafeHttpUrl(
            application.interviewLocationUrl,
          );
          const platform = getInterviewPlatform(
            application.interviewLocationUrl ?? "",
          );
          const interviewDateValue = application.interviewDate
            ? new Date(`${application.interviewDate}T00:00:00`)
            : null;
          const formattedDate =
            interviewDateValue && !Number.isNaN(interviewDateValue.getTime())
              ? interviewDateValue.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : application.interviewDate || "Not provided";

          return (
            <div
              className="fixed inset-0 z-[1250] grid place-items-center bg-black/80 p-5 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setSelectedInterviewApplication(null);
                }
              }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="interview-details-title"
                className="relative w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-6 text-white shadow-2xl"
              >
                <button
                  type="button"
                  aria-label="Close interview details"
                  onClick={() => setSelectedInterviewApplication(null)}
                  className="absolute right-4 top-4 rounded-md border border-zinc-700 px-2 py-1 text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
                <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                  Interview confirmed
                </span>
                <h2
                  id="interview-details-title"
                  className="mt-2 pr-8 text-xl font-bold"
                >
                  Interview Details
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {application.jobTitle} · {application.company || "JobSphere"}
                </p>

                <dl className="mt-5 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm">
                  <div>
                    <dt className="text-xs text-zinc-500">Platform</dt>
                    <dd className="mt-1 font-medium text-zinc-100">
                      {platform.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Date</dt>
                    <dd className="mt-1 font-medium text-zinc-100">
                      {formattedDate}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Time</dt>
                    <dd className="mt-1 font-medium text-zinc-100">
                      {application.interviewTime || "Not provided"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">HR Contact</dt>
                    <dd className="mt-1 font-medium text-zinc-100">
                      {application.hrContactNumber ? (
                        <a
                          href={`tel:${application.hrContactNumber}`}
                          className="text-emerald-300 hover:underline"
                        >
                          {application.hrContactNumber}
                        </a>
                      ) : (
                        "Not provided"
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 grid gap-3">
                  {meetingLink ? (
                    <a
                      href={meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-emerald-500 px-4 py-3 text-center text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
                    >
                      Join Meeting
                    </a>
                  ) : (
                    <p className="text-sm text-amber-300">
                      The meeting link is unavailable or invalid.
                    </p>
                  )}
                  {platform.playStoreUrl && (
                    <a
                      href={platform.playStoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-zinc-700 px-4 py-3 text-center text-sm font-semibold text-zinc-200 transition-colors hover:border-emerald-500 hover:text-white"
                    >
                      Download App (Play Store)
                    </a>
                  )}
                </div>
              </section>
            </div>
          );
        })()}
      {resumeAnalysis && (
        <div className="resume-analysis-overlay">
          <section
            className="resume-analysis-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resume-analysis-title"
          >
            <button
              type="button"
              className="resume-analysis-close"
              onClick={() => setResumeAnalysis(null)}
              aria-label="Close resume analysis"
            >
              ✕
            </button>
            <span className="eyebrow">AI RESUME SCAN</span>
            <h2 id="resume-analysis-title">Resume Analysis Complete</h2>
            <p className="resume-analysis-candidate">
              Analysis for {resumeAnalysis.candidateName}
            </p>
            <div className="resume-ats-score">
              <strong>{resumeAnalysis.atsScore}</strong>
              <span>/100 ATS Resume Score</span>
            </div>

            <div className="resume-analysis-section">
              <h3>Extracted Skills</h3>
              {resumeAnalysis.extractedSkills.length > 0 ? (
                <div className="resume-analysis-pills">
                  {resumeAnalysis.extractedSkills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              ) : (
                <p className="resume-analysis-empty">
                  No supported skills were detected in this resume.
                </p>
              )}
            </div>

            <div className="resume-analysis-section">
              <h3>Recommended Roles</h3>
              <div className="resume-analysis-pills resume-role-pills">
                {resumeAnalysis.recommendedRoles.map((role) => (
                  <span key={role}>{role}</span>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="resume-analysis-done"
              onClick={() => setResumeAnalysis(null)}
            >
              Done
            </button>
          </section>
        </div>
      )}

      {selectedSummaryCandidate && (
        <div className="resume-analysis-overlay">
          <section
            className="resume-analysis-modal recruiter-ai-summary"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recruiter-summary-title"
          >
            <button
              type="button"
              className="resume-analysis-close"
              onClick={() => setSelectedSummaryCandidate(null)}
              aria-label="Close candidate AI summary"
            >
              ✕
            </button>
            <span className="eyebrow">RECRUITER VIEW</span>
            <h2 id="recruiter-summary-title">AI Candidate Summary</h2>
            <p className="resume-analysis-candidate">
              {selectedSummaryCandidate.candidateName} · {selectedSummaryCandidate.jobTitle}
            </p>
            {typeof selectedSummaryCandidate.atsScore === "number" ? (
              <div className="resume-ats-score">
                <strong>{selectedSummaryCandidate.atsScore}</strong>
                <span>/100 ATS Resume Score</span>
              </div>
            ) : (
              <p className="resume-analysis-empty">
                No ATS analysis is available for this candidate yet.
              </p>
            )}
            <div className="resume-analysis-section">
              <h3>Parsed Candidate Strengths</h3>
              {selectedSummaryCandidate.extractedSkills?.length ? (
                <div className="resume-analysis-pills">
                  {selectedSummaryCandidate.extractedSkills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              ) : (
                <p className="resume-analysis-empty">
                  No parsed skills are available.
                </p>
              )}
            </div>
            <div className="resume-analysis-section">
              <h3>Recommended Roles</h3>
              {selectedSummaryCandidate.recommendedRoles?.length ? (
                <div className="resume-analysis-pills resume-role-pills">
                  {selectedSummaryCandidate.recommendedRoles.map((role) => (
                    <span key={role}>{role}</span>
                  ))}
                </div>
              ) : (
                <p className="resume-analysis-empty">
                  No role recommendations are available.
                </p>
              )}
            </div>
            <button
              type="button"
              className="resume-analysis-done"
              onClick={() => setSelectedSummaryCandidate(null)}
            >
              Close Summary
            </button>
          </section>
        </div>
      )}

{/* Resume Preview Modal */}
      {selectedCandidate && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "12px",
              padding: "24px",
              width: "500px",
              maxWidth: "90%",
              color: "#fff",
              position: "relative",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#10b981" }}>Resume Preview</h3>
              <button
                onClick={() => setSelectedCandidate(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#a1a1aa",
                  fontSize: "18px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body Details */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px" }}>
              <p><strong>Candidate:</strong> {selectedCandidate.candidateName}</p>
              <p><strong>Applied Role:</strong> {selectedCandidate.jobTitle}</p>
              <p><strong>Match Score:</strong> <span style={{ color: "#10b981", fontWeight: "bold" }}>{selectedCandidate.matchScore}</span></p>
              <p><strong>Status:</strong> {selectedCandidate.status}</p>
              <hr style={{ borderColor: "#27272a", margin: "10px 0" }} />
              <p><strong>Parsed Resume Summary:</strong></p>
              <div style={{ background: "#09090b", padding: "12px", borderRadius: "6px", fontSize: "13px", color: "#a1a1aa" }}>
                Candidate has experience matching key keywords in {selectedCandidate.jobTitle}. Strong problem solving and dynamic project expertise demonstrated.
              </div>
              <p><strong>AI Generated Cover Letter</strong></p>
              <div
                style={{
                  background: "#18181b",
                  padding: "12px",
                  borderRadius: "6px",
                  fontSize: "14px",
                  color: "#d4d4d8",
                  maxHeight: "10rem",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {selectedCandidate.coverLetter?.trim() || "No cover letter attached."}
              </div>
            </div>

{/* Modal Footer Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px" }}>
            <button
             onClick={() => {
  const resumeFile = selectedCandidate.resumeFile;
  const isPdfFile =
    resumeFile?.type === "application/pdf" ||
    resumeFile?.name.toLowerCase().endsWith(".pdf");

  if (resumeFile && isPdfFile) {
    window.open(URL.createObjectURL(resumeFile), "_blank", "noopener,noreferrer");
    return;
  }

  const resumeUrl = getCandidateResumeUrl(selectedCandidate.resumeUrl);
  if (resumeUrl) {
    window.open(resumeUrl, "_blank", "noopener,noreferrer");
    return;
  }

  toast.error("No uploaded resume is available for this candidate.");
}}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                background: "#10b981",
                color: "#000",
                fontWeight: "bold",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              📄 View Resume
            </button>

            <button
              onClick={() => setSelectedCandidate(null)}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "1px solid #3f3f46",
                background: "#27272a",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {/* JOB DETAILS MODAL */}
    {selectedJob && (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px",
        }}
      >
        <div
          style={{
            backgroundColor: "#141a26",
            border: "1px solid #1f2937",
            borderRadius: "20px",
            padding: "28px",
            maxWidth: "600px",
            width: "100%",
            maxHeight: "85vh",
            overflowY: "auto",
            position: "relative",
            color: "#ffffff",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          }}
        >
          <button
            onClick={handleCloseJobDetails}
            style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              background: "none",
              border: "none",
              color: "#9ca3af",
              fontSize: "20px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>

          {/* Header */}
          <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "20px" }}>
            <div className="company-logo" style={{ width: "56px", height: "56px", fontSize: "20px" }}>
              {selectedJob.company
                .split(" ")
                .map((word) => word[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: "700" }}>{selectedJob.title}</h2>
              <p style={{ margin: 0, color: "#9ca3af", fontSize: "14px" }}>
                {selectedJob.company} • {selectedJob.location}
              </p>
            </div>
          </div>

          {/* Badges */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
            <span style={{ background: "rgba(255, 255, 255, 0.08)", padding: "6px 12px", borderRadius: "8px", fontSize: "13px" }}>
              💼 {selectedJob.type}
            </span>
            <span style={{ background: "rgba(255, 255, 255, 0.08)", padding: "6px 12px", borderRadius: "8px", fontSize: "13px" }}>
              💰 {selectedJob.salary}
            </span>
            <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "6px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "600" }}>
              ⚡ {selectedJob.matchScore}% Match
            </span>
          </div>

          <hr style={{ borderColor: "#1f2937", margin: "20px 0" }} />

          {/* Job Description */}
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>About the Role</h3>
            <p style={{ color: "#d1d5db", fontSize: "14px", lineHeight: "1.6" }}>
              {selectedJob.company} is looking for a talented <strong>{selectedJob.title}</strong> to join our team in {selectedJob.location}. You will be working with modern web tech stacks and collaborates on scalable solutions.
            </p>
          </div>

          {/* Required Skills */}
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "10px" }}>Required Skills</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {selectedJob.skills?.map((skill: string) => (
                <span
                  key={skill}
                  style={{
                    background: "#1f2937",
                    color: "#9ca3af",
                    padding: "6px 12px",
                    borderRadius: "20px",
                    fontSize: "12px",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          <section className="salary-benchmark-card" aria-live="polite">
            <div className="salary-benchmark-heading">
              <div>
                <h3>💰 AI Market Salary Benchmark</h3>
                <p>
                  Indicative estimate based on role, experience, skills, and
                  location; not a live salary feed.
                </p>
              </div>
              <span className="salary-benchmark-badge">Real-Time Data</span>
            </div>
            <div className="salary-benchmark-controls">
              <label htmlFor="salary-experience-years">Experience</label>
              <input
                id="salary-experience-years"
                type="number"
                min="0"
                max="50"
                step="1"
                value={salaryExperienceYears}
                onChange={(event) => {
                  const years = Number(event.target.value);
                  if (Number.isInteger(years) && years >= 0 && years <= 50) {
                    setSalaryExperienceYears(years);
                    void fetchSalaryBenchmark(selectedJob, years);
                  }
                }}
              />
              <span>
                {salaryExperienceYears === 1
                  ? "year"
                  : "years"}
              </span>
            </div>
            <p className="salary-benchmark-role">
              Estimate for <strong>{selectedJob.title}</strong> with{" "}
              {salaryExperienceYears}{" "}
              {salaryExperienceYears === 1 ? "year" : "years"} of experience
            </p>
            {salaryBenchmarkLoading ? (
              <p className="salary-benchmark-loading" role="status">
                Calculating your salary range…
              </p>
            ) : salaryBenchmarkError ? (
              <div className="salary-benchmark-error" role="alert">
                <span>{salaryBenchmarkError}</span>
                <button
                  type="button"
                  onClick={() =>
                    void fetchSalaryBenchmark(selectedJob, salaryExperienceYears)
                  }
                >
                  Retry
                </button>
              </div>
            ) : salaryBenchmark ? (
              <>
                <p className="salary-benchmark-range">
                  {salaryBenchmark.formattedRange}
                </p>
                <ul className="salary-benchmark-insights">
                  {salaryBenchmark.insights.map((insight) => (
                    <li key={insight}>{insight}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
{/* Action Buttons */}
          <div style={{ display: "flex", gap: "12px", marginTop: "28px" }}>
            <button
              onClick={() => {
                setApplicantName("");
                setApplicantEmail("");
                setApplicantResume(null);
                setApplicationJob(selectedJob);
              }}
              style={{
                flex: 1,
                backgroundColor: appliedJobIds.includes(selectedJob.id) ? "#374151" : "#10b981",
                color: "#000000",
                fontWeight: "700",
                padding: "12px",
                borderRadius: "12px",
                border: "none",
                cursor: appliedJobIds.includes(selectedJob.id) ? "not-allowed" : "pointer",
                fontSize: "15px",
              }}
              disabled={appliedJobIds.includes(selectedJob.id)}
            >
              {appliedJobIds.includes(selectedJob.id) ? "Already Applied" : "Apply with Resume"}
            </button>

            <button
              onClick={() => handleGenerateCoverLetter(selectedJob.title, selectedJob.company)}
              style={{
                background: 'transparent',
                color: '#00FF66',
                border: '1px solid #00FF66',
                padding: '12px 20px',
                borderRadius: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '15px',
              }}
            >
              ✨ Generate AI Cover Letter
            </button>

            <button
              onClick={handleCloseJobDetails}
              style={{
                backgroundColor: "transparent",
                border: "1px solid #374151",
                color: "#9ca3af",
                padding: "12px 20px",
                borderRadius: "12px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>

          {showCLModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: "#121212",
                  border: "1px solid #00FF66",
                  borderRadius: "12px",
                  padding: "24px",
                  maxWidth: "600px",
                  width: "90%",
                  color: "#fff",
                  boxShadow: "0 0 20px rgba(0, 255, 102, 0.15)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <h3 style={{ margin: 0, color: "#00FF66", fontSize: "18px" }}>
                    ✨ AI Generated Cover Letter
                  </h3>
                  <button
                    onClick={() => setShowCLModal(false)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#888",
                      cursor: "pointer",
                      fontSize: "18px",
                    }}
                  >
                    ✕
                  </button>
                </div>

                {isGeneratingCL ? (
                  <p
                    style={{
                      color: "#aaa",
                      padding: "20px 0",
                      textAlign: "center",
                    }}
                  >
                    Crafting personalized cover letter using AI...
                  </p>
                ) : (
                  <>
                    <textarea
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      rows={10}
                      style={{
                        width: "100%",
                        background: "#09090b",
                        color: "#e4e4e7",
                        border: "1px solid #27272a",
                        borderRadius: "8px",
                        padding: "12px",
                        fontFamily: "monospace",
                        fontSize: "13px",
                        resize: "vertical",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        marginTop: "16px",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => setShowCLModal(false)}
                        style={{
                          background: "#27272a",
                          color: "#fff",
                          border: "none",
                          padding: "10px 16px",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    {interviewPrepJob && (
      <div
        className="interview-prep-overlay"
        role="presentation"
        onClick={(event) => {
          if (
            event.target === event.currentTarget &&
              !mockInterviewLoading &&
              !polishingInterviewAnswer
          ) {
            setInterviewPrepJob(null);
          }
        }}
      >
        <section
          className="interview-prep-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="interview-prep-title"
        >
          <header className="interview-prep-header">
            <div>
              <span className="interview-prep-eyebrow">PERSONALIZED PRACTICE</span>
              <h2 id="interview-prep-title">
                AI Interview Coach for {interviewPrepJob.title}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close interview prep"
              onClick={() => setInterviewPrepJob(null)}
              disabled={mockInterviewLoading || polishingInterviewAnswer}
            >
              ✕
            </button>
          </header>

          <nav className="interview-prep-tabs" aria-label="Interview preparation mode">
            <button
              type="button"
              className={activePrepTab === "mock" ? "active" : ""}
              aria-pressed={activePrepTab === "mock"}
              onClick={() => setActivePrepTab("mock")}
            >
              🎙️ Mock Interviewer
            </button>
            <button
              type="button"
              className={activePrepTab === "english" ? "active" : ""}
              aria-pressed={activePrepTab === "english"}
              onClick={() => setActivePrepTab("english")}
            >
              ✍️ English Express Assistant (Hinglish to Corporate)
            </button>
          </nav>

          {activePrepTab === "english" ? (
            <div className="english-express-content">
              <p className="english-express-subtitle">
                Translate your Hindi/Hinglish rough answer into professional corporate English.
              </p>
              <div className="english-express-grid grid grid-cols-1 md:grid-cols-2 gap-4">
                <section className="english-answer-panel">
                  <label htmlFor="rough-interview-answer">
                    Your Rough Answer (Hindi / Hinglish)
                  </label>
                  <textarea
                    id="rough-interview-answer"
                    value={roughInterviewAnswer}
                    onChange={(event) => setRoughInterviewAnswer(event.target.value)}
                    placeholder="Yahan Hindi/Hinglish mein type karein..."
                    rows={8}
                    disabled={polishingInterviewAnswer}
                  />
                </section>
                <section className="english-answer-panel english-output-panel">
                  <div className="english-output-heading">
                    <h3>Converted English Answer</h3>
                    <button
                      type="button"
                      onClick={handleCopyPolishedAnswer}
                      disabled={!polishedInterviewAnswer}
                    >
                      📋 Copy Answer
                    </button>
                  </div>
                  <div className="polished-answer-card" aria-live="polite">
                    {polishingInterviewAnswer ? (
                      <p className="english-output-placeholder">
                        Converting your answer...
                      </p>
                    ) : polishedInterviewAnswer ? (
                      <>
                        <p className="polished-answer-text">
                          {polishedInterviewAnswer}
                        </p>
                        {interviewVocabulary.length > 0 && (
                          <div className="interview-vocabulary">
                            <h4>Key Vocabulary Used</h4>
                            <div>
                              {interviewVocabulary.map((word) => (
                                <span key={word}>{word}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {interviewProTip && (
                          <aside className="interview-pro-tip">
                            <strong>💡 Pro Tip for Interview</strong>
                            <p>{interviewProTip}</p>
                          </aside>
                        )}
                      </>
                    ) : (
                      <p className="english-output-placeholder">
                        Your professional English answer will appear here.
                      </p>
                    )}
                  </div>
                </section>
                <button
                  type="button"
                  className="english-express-convert english-express-convert-full"
                  onClick={handlePolishInterviewAnswer}
                  disabled={polishingInterviewAnswer || !roughInterviewAnswer.trim()}
                >
                  {polishingInterviewAnswer ? (
                    <>
                      <span className="english-express-spinner" aria-hidden="true" />
                      Polishing your answer...
                    </>
                  ) : (
                    "✨ Convert to Professional English"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="mock-interview-content">
              <div className="mock-interview-chat" aria-live="polite">
                {mockInterviewTurns.map((turn, index) => (
                  <div className="mock-interview-exchange" key={`mock-turn-${index}`}>
                    <div className="mock-chat-message mock-ai-message">
                      <span className="mock-chat-avatar">AI</span>
                      <div>
                        <span className="mock-chat-speaker">AI Interviewer</span>
                        <p>{turn.question}</p>
                      </div>
                    </div>
                    {turn.candidateAnswer && (
                      <>
                        <div className="mock-chat-message mock-candidate-message">
                          <span className="mock-chat-avatar">You</span>
                          <div>
                            <span className="mock-chat-speaker">Your answer</span>
                            <p>{turn.candidateAnswer}</p>
                          </div>
                        </div>
                        {turn.feedback && (
                          <section className="ai-feedback-card" aria-label="AI Feedback">
                            <div className="ai-feedback-heading">
                              <strong>AI Feedback</strong>
                              <span
                                className={`ai-feedback-score ${
                                  turn.feedback.score >= 8
                                    ? "score-high"
                                    : "score-average"
                                }`}
                              >
                                Score: {turn.feedback.score.toFixed(1)}/10
                              </span>
                            </div>
                            <p><strong>✅ What went well</strong></p>
                            <ul><li>{turn.feedback.whatWentWell}</li></ul>
                            <p><strong>💡 Improvement Tips</strong></p>
                            <ul><li>{turn.feedback.improvementTip}</li></ul>
                          </section>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {mockInterviewLoading && (
                  <div className="mock-evaluation-loading" role="status">
                    <span className="mock-loading-dot" />
                    AI is reviewing your answer...
                  </div>
                )}
              </div>
              <div className="mock-interview-composer">
                <label htmlFor="mock-interview-answer">Your answer</label>
                <div className="mock-answer-input-row">
                  <textarea
                    id="mock-interview-answer"
                    value={mockInterviewAnswer}
                    onChange={(event) => setMockInterviewAnswer(event.target.value)}
                    placeholder="Type your answer here..."
                    rows={3}
                    disabled={mockInterviewLoading}
                  />
                  <button
                    type="button"
                    className="mock-mic-button"
                    aria-label="Microphone speech input demo"
                    title="Speech input demo"
                    onClick={() => toast("🎙️ Voice input demo coming soon.")}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="9" y="2" width="6" height="12" rx="3" />
                      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  className="mock-submit-answer"
                  onClick={handleSubmitMockInterviewAnswer}
                  disabled={mockInterviewLoading || !mockInterviewAnswer.trim()}
                >
                  {mockInterviewLoading ? "Evaluating..." : "Submit Answer"}
                </button>
              </div>
            </div>
          )}

          <footer className="interview-prep-footer">
            <button
              type="button"
              className="prep-close-button"
              onClick={() => setInterviewPrepJob(null)}
              disabled={mockInterviewLoading || polishingInterviewAnswer}
            >
              Close
            </button>
          </footer>
        </section>
      </div>
    )}
</main>); }

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"
        style={{ fill: filled ? "currentColor" : "none" }}
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg 
      viewBox="0 0 24 24" 
      width="20" 
      height="20" 
      fill="currentColor" 
      style={{ display: "inline-block", flexShrink: 0, width: "20px", height: "20px" }}
      aria-hidden="true"
    >
      <path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
    </svg>
  );
}