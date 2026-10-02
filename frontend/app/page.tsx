"use client";

import { useState, useEffect } from "react";

type Job = {
  id: number;
  company: string;
  title: string;
  location: string;
  type: string;
  salary: string;
  skills: string[];
  match?: number;
  posted?: string;
  logo?: string;
};

const initialJobs: Job[] = [
  {
    id: 1,
    company: "TechNova Solutions",
    logo: "TN",
    title: "Junior Software Developer",
    location: "Bhopal, Madhya Pradesh",
    type: "Full-time",
    salary: "₹4.5 – 7 LPA",
    skills: ["JavaScript", "React", "Node.js"],
    match: 94,
    posted: "2 days ago",
  },
  {
    id: 2,
    company: "DataSphere AI",
    logo: "DS",
    title: "AI / ML Intern",
    location: "Bhopal, Madhya Pradesh",
    type: "Internship",
    salary: "₹15K – 25K / month",
    skills: ["Python", "Machine Learning", "SQL"],
    match: 89,
    posted: "1 day ago",
  },
  {
    id: 3,
    company: "CodeCraft Technologies",
    logo: "CC",
    title: "Frontend Developer",
    location: "Indore, Madhya Pradesh",
    type: "Full-time",
    salary: "₹5 – 8 LPA",
    skills: ["React", "Next.js", "TypeScript"],
    match: 86,
    posted: "3 days ago",
  },
];

export default function Home() {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [searched, setSearched] = useState(false);

  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
const [isAdmin, setIsAdmin] = useState(false);
const [showAdminModal, setShowAdminModal] = useState(false);
const [adminPassword, setAdminPassword] = useState("");
const [applications, setApplications] = useState([
  {
    id: 1,
    candidateName: "Sparsh",
    email: "sparshshri5182@gmail.com",
    jobTitle: "Junior Software Developer",
    matchScore: "100%",
    status: "Applied",
    appliedAt: "Today"
  }
]);
  // Resume Upload & AI Agent States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
 const [appliedJobIds, setAppliedJobIds] = useState<any[]>([]);
 const [statusFilter, setStatusFilter] = useState<string>("All");
 const [searchTerm, setSearchTerm] = useState("");
 const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
 useEffect(() => {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("appliedJobIds");
    if (saved) {
      try {
        setAppliedJobIds(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }
}, []);

useEffect(() => {
  if (typeof window !== "undefined") {
    localStorage.setItem("appliedJobIds", JSON.stringify(appliedJobIds));
  }
}, [appliedJobIds]);
  const [activeTab, setActiveTab] = useState<"all" | "applied">("all");
  useEffect(() => {
  const fetchAppliedJobs = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/applications");
      const data = await res.json();
      if (data.success && data.appliedJobIds) {
        setAppliedJobIds(data.appliedJobIds);
      }
    } catch (err) {
      console.error("Failed to load applied jobs:", err);
    }
  };

  fetchAppliedJobs();
}, []);
  const handleApplyJob = async (jobId: number) => {
  if (appliedJobIds.includes(jobId)) return;

  try {
    const res = await fetch(`http://localhost:5000/api/jobs/${jobId}/apply`, {
      method: "POST",
    });
    const data = await res.json();

    if (data.success) {
      setAppliedJobIds((prev) => [...prev, jobId]);
    }
  } catch (err) {
    console.error("Error applying for job:", err);
    setAppliedJobIds((prev) => [...prev, jobId]);
  }
};
const filteredJobs = jobs.filter((job: any) => {
  const matchesTab =
    activeTab === "all" ? true : appliedJobIds.includes(job.id);

  const query = search ? search.toLowerCase() : "";
  const matchesSearch =
    job.title?.toLowerCase().includes(query) ||
    job.company?.toLowerCase().includes(query) ||
    job.skills?.some((skill: string) => skill.toLowerCase().includes(query));

  return matchesTab && matchesSearch;
});
const getMatchScore = (jobSkills: string[]) => {
  if (!userSkills || userSkills.length === 0 || !jobSkills || jobSkills.length === 0) {
    return 0;
  }
  const matched = jobSkills.filter((skill) =>
    userSkills.some((uSkill) => uSkill.toLowerCase() === skill.toLowerCase())
  );
  return Math.round((matched.length / jobSkills.length) * 100);
};
const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  setUploading(true);
  const formData = new FormData();
  formData.append("resume", file);

  try {
    const res = await fetch("http://localhost:5000/api/resume/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (res.ok) {
      if (data.jobs) setJobs(data.jobs);
      if (data.userSkills) setUserSkills(data.userSkills);

      // Extract details from backend response or fallback to file name
      const candidateName = data.name || file.name.replace(/\.[^/.]+$/, "");
      const email = data.email || "applicant@jobsphere.ai";
      const matchScore = data.matchScore ? `${data.matchScore}%` : "85%";

      const newApplication = {
        id: Date.now().toString(),
        candidateName,
        email,
        jobTitle: "Software Engineer Applicant",
        matchScore,
        status: "Applied",
      };

      // Real-time update in Admin portal
      setApplications((prev) => [newApplication, ...prev]);
      setIsModalOpen(false);
      alert("✓ Resume analyzed & added to Recruiter Admin Dashboard!");
    } else {
      alert("Failed to analyze resume.");
    }
  } catch (err) {
    console.error("Resume upload error:", err);
    alert("Failed to analyze resume.");
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

      if (search.trim()) {
        params.append("search", search.trim());
      }

      if (location.trim()) {
        params.append("location", location.trim());
      }

      const response = await fetch(
        `http://localhost:5000/api/jobs?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch jobs");
      }

      const data = await response.json();

      if (data.success) {
        const formattedJobs: Job[] = data.jobs.map((job: any) => ({
          ...job,
          logo:
            job.logo ||
            job.company
              .split(" ")
              .map((word: string) => word[0])
              .join("")
              .slice(0, 2)
              .toUpperCase(),
          match: job.matchScore ?? job.match ?? 85,
          posted: job.posted ?? "Recently posted",
        }));

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



  return (
    <main>
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="nav-container">
          <a href="#" className="logo">
            <span className="logo-mark">J</span>
            <span>
              Job<span>Sphere</span>
            </span>
            <small>AI</small>
          </a>

          <div className="nav-links">
            <a href="#jobs">Find Jobs</a>
            <a href="#ai">AI Assistant</a>
            <a href="#how">How It Works</a>
            <a href="#about">About</a>
          </div>
<a 
  href="/pricing" 
  style={{ 
    color: "#000", 
    textDecoration: "none", 
    fontWeight: "bold",
    background: "#22c55e", // Website ke green theme se match karta hua
    padding: "6px 14px",
    borderRadius: "6px",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "14px",
    boxShadow: "0 0 10px rgba(34, 197, 94, 0.3)"
  }}
>
  ✨ Pro Plans
</a>
          <div className="nav-actions">
            <button className="login-btn" onClick={() => setIsModalOpen(true)}>
              Upload Resume
            </button>
            <button className="signup-btn">Get Started</button>
          </div>
          <button 
  onClick={() => {
    if (isAdmin) {
      setIsAdmin(false);
    } else {
      setShowAdminModal(true);
    }
  }}
  style={{
    padding: "8px 16px",
    borderRadius: "8px",
    backgroundColor: isAdmin ? "#e11d48" : "#27272a",
    color: "#fff",
    border: "1px solid #3f3f46",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "14px"
  }}
>
  {isAdmin ? "Exit Admin View" : "🔒 Admin Access"}
</button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-glow glow-one" />
        <div className="hero-glow glow-two" />

        <div className="hero-container">
          <div className="hero-badge">
            <span className="pulse-dot" />
            AI-powered job discovery
          </div>

          <h1>
            Find a job that
            <br />
            <span>fits you.</span>
          </h1>

          <p className="hero-description">
            Search thousands of opportunities, understand your match,
            and let AI help you move from <strong>search to apply.</strong>
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
            <strong>25K+</strong>
            <span>Job opportunities</span>
          </div>

          <div className="stat">
            <strong>4.8K+</strong>
            <span>Companies</span>
          </div>

          <div className="stat">
            <strong>92%</strong>
            <span>Average match accuracy</span>
          </div>

          <div className="stat">
            <strong>24/7</strong>
            <span>AI career assistant</span>
          </div>
        </div>
      </section>

      {/* JOBS */}
      <section className="jobs-section" id="jobs">
        <div className="section-container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">OPPORTUNITIES</span>
              <h2>
                Jobs made for <span>you.</span>
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
</div>
            <button className="view-all">
              View all jobs <ArrowIcon />
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
          {searched && !loading && jobs.length === 0 && !error && (
            <div className="no-results">
              <div className="no-results-icon">
                <SearchIcon />
              </div>
              <h3>No matching jobs found</h3>
              <p>Try another job title, skill, company, or location.</p>
              <button onClick={clearSearch}>Show all jobs</button>
            </div>
          )}

          {/* JOB GRID */}
       {filteredJobs.length > 0 && (
            <div className="job-grid">
             {filteredJobs.map((job) => (
                <article className="job-card" key={job.id}>
                  <div className="job-card-top">
      {(() => {
  const app = applications.find((a) => a.jobTitle === job.title);
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
                      {job.logo ||
                        job.company
                          .split(" ")
                          .map((word) => word[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                    </div>

                    <button
                      className="save-btn"
                      aria-label="Save job"
                      onClick={() => console.log("Saved job:", job.title)}
                    >
                      <HeartIcon />
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
                     <span>{userSkills.length > 0 ? getMatchScore(job.skills || []) : (job.match ?? 85)}%</span>
                      </div>

                      <div>
                        <strong>AI Match</strong>
                        <small>{job.posted ?? "Recently posted"}</small>
                      </div>
                    </div>

                    <button
                      className="details-btn"
                      onClick={() => setSelectedJob(job)}
                    >
                      View Job <ArrowIcon />
                    </button>
                  </div>
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
              Tell JobSphere what you want in plain language. Our AI agents
              analyze your profile, search opportunities, compare requirements,
              and explain why a job matches you.
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
                I found <strong>12 opportunities</strong> that match your
                profile. Your top match is an AI/ML Intern role with an
                estimated <strong>91% match.</strong>
              </div>

              <div className="mini-job">
                <div className="mini-company">DS</div>

                <div>
                  <strong>AI / ML Intern</strong>
                  <span>DataSphere AI · Bhopal</span>
                </div>

                <b>91%</b>
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
              <h3>Build your profile</h3>
              <p>
                Upload your resume and tell us about your skills, experience,
                and career goals.
              </p>
            </div>

            <div className="step">
              <div className="step-number">02</div>
              <h3>Let AI match you</h3>
              <p>
                Our intelligent agents compare your profile with relevant job
                requirements.
              </p>
            </div>

            <div className="step">
              <div className="step-number">03</div>
              <h3>Apply with confidence</h3>
              <p>
                Understand your match and continue to the original employer
                application.
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

          <p>Intelligent job discovery for the next generation.</p>

          <span className="copyright">
            © 2026 JobSphere AI. Major Project.
          </span>
        </div>
      </footer>

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
              setIsAdmin(true);
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
{isAdmin && (
  <div style={{ margin: "32px auto", maxWidth: "1200px", padding: "20px", background: "#18181b", borderRadius: "12px", border: "1px solid #27272a" }}>
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

      <table style={{ width: "100%", textAlign: "left", color: "#fff", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #3f3f46", color: "#a1a1aa" }}>
            <th style={{ padding: "12px" }}>Candidate</th>
            <th style={{ padding: "12px" }}>Applied Job</th>
            <th style={{ padding: "12px" }}>Match Score</th>
            <th style={{ padding: "12px" }}>Status</th>
            <th style={{ padding: "12px" }}>Actions</th>
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
              <tr key={app.id} style={{ borderBottom: "1px solid #27272a" }}>
                <td style={{ padding: "12px" }}>
                  {app.candidateName}<br/>
                  <span style={{ fontSize: "12px", color: "#71717a" }}>{app.email}</span>
                </td>
                <td style={{ padding: "12px" }}>{app.jobTitle}</td>
                <td style={{ padding: "12px", color: "#10b981", fontWeight: "bold" }}>{app.matchScore}</td>
                <td style={{ padding: "12px" }}>
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    background: app.status === "Shortlisted" ? "#065f46" : app.status === "Rejected" ? "#7f1d1d" : "#3f3f46",
                    color: "#fff"
                  }}>
                    {app.status}
                  </span>
                </td>
                <td style={{ padding: "12px" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
  onClick={() => setSelectedCandidate(app)}
  style={{
    padding: "4px 8px",
    background: "#27272a",
    color: "#fff",
    border: "1px solid #3f3f46",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
  }}
>
  View Resume
</button>
                    <button
                      onClick={() => {
                        setApplications((prev) =>
                          prev.map((a) => (a.id === app.id ? { ...a, status: "Shortlisted" } : a))
                        );
                      }}
                      style={{ padding: "4px 8px", background: "#10b981", color: "#000", border: "none", borderRadius: "4px", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}
                    >
                      Shortlist
                    </button>
                    <button
                      onClick={() => {
                        setApplications((prev) =>
                          prev.map((a) => (a.id === app.id ? { ...a, status: "Rejected" } : a))
                        );
                      }}
                      style={{ padding: "4px 8px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}
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
            </div>

{/* Modal Footer Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px" }}>
            <button
             onClick={() => {
  const pdfPath = (selectedCandidate.resumeUrl && selectedCandidate.resumeUrl !== "#")
    ? selectedCandidate.resumeUrl
    : "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"; // Sample working PDF fallback
  window.open(pdfPath, "_blank");
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
              📄 View Full PDF
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
            onClick={() => setSelectedJob(null)}
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
              {selectedJob.logo}
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
              ⚡ {selectedJob.match ?? 85}% Match
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

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "12px", marginTop: "28px" }}>
            <button
              onClick={() => {
                handleApplyJob(selectedJob.id);
                alert(`Application submitted for ${selectedJob.title} at ${selectedJob.company}!`);
                setSelectedJob(null);
              }}
              style={{
                flex: 1,
                backgroundColor: appliedJobIds.includes(selectedJob.id) ? "#374151" : "#10b981",
                color: appliedJobIds.includes(selectedJob.id) ? "#9ca3af" : "#000000",
                fontWeight: "700",
                padding: "12px",
                borderRadius: "12px",
                border: "none",
                cursor: appliedJobIds.includes(selectedJob.id) ? "not-allowed" : "pointer",
                fontSize: "15px",
              }}
              disabled={appliedJobIds.includes(selectedJob.id)}
            >
              {appliedJobIds.includes(selectedJob.id) ? "Already Applied" : "Apply Now"}
            </button>
            <button
              onClick={() => setSelectedJob(null)}
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
        </div>
      </div>
    )}
  </main>
);
}

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

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z" />
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