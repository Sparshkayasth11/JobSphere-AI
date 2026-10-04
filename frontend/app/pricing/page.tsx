"use client";

import React, { useState } from "react";
import toast from 'react-hot-toast';

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSubscribe = async (planName: string, price: string) => {
    setLoadingPlan(planName);
    // Simulate API call / Razorpay / Stripe checkout redirection
    setTimeout(() => {
      if (planName === "Student Pass") {
      toast.success(`Success! Your 1-Day Free Trial for ${planName} (${price}) has been activated.`, {
  style: { background: '#121212', color: '#00FF66', border: '1px solid #00FF66' },
  iconTheme: { primary: '#00FF66', secondary: '#121212' },
});
      } else if (planName === "Pro Membership") {
      toast.loading(`Redirecting to secure Razorpay checkout for ${planName} (${price}) [Billed ${billingCycle}]...`, {
  style: { background: '#121212', color: '#00FF66', border: '1px solid #00FF66' },
});
      } else {
       toast.success(`Connecting you with our Enterprise Sales team for ${planName} (${price})...`, {
  style: { background: '#121212', color: '#00FF66', border: '1px solid #00FF66' },
  iconTheme: { primary: '#00FF66', secondary: '#121212' },
});;
      }
      setLoadingPlan(null);
      // window.location.href = "/dashboard"; // Baad me dashboard redirect ke liye
    }, 1000);
  };

  return (
    <div style={{ background: "#09090b", minHeight: "100vh", color: "#fff", padding: "40px 20px", fontFamily: "sans-serif" }}>
      {/* Back to Home Link */}
      <div style={{ maxWidth: "1200px", margin: "0 auto 20px auto" }}>
        <a href="/" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          ← Back to Dashboard
        </a>
      </div>

      <section className="pricing-section" style={{ textAlign: "center" }}>
        <div className="pricing-header" style={{ marginBottom: "40px" }}>
          <h1 style={{ fontSize: "40px", fontWeight: "800", marginBottom: "15px", background: "linear-gradient(to right, #ffffff, #a1a1aa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Upgrade Your JobSphere Experience 🚀
          </h1>
          <p style={{ color: "#a1a1aa", fontSize: "16px", maxWidth: "600px", margin: "0 auto" }}>
            Choose the right plan designed for students and professionals to unlock advanced AI tools.
          </p>

          {/* Monthly / Yearly Toggle */}
          <div style={{ marginTop: "25px", display: "inline-flex", background: "#18181b", border: "1px solid #27272a", padding: "4px", borderRadius: "10px" }}>
            <button
              onClick={() => setBillingCycle("monthly")}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                border: "none",
                background: billingCycle === "monthly" ? "#27272a" : "transparent",
                color: "#fff",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "14px",
                transition: "all 0.2s"
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                border: "none",
                background: billingCycle === "yearly" ? "#27272a" : "transparent",
                color: "#fff",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "14px",
                transition: "all 0.2s"
              }}
            >
              Yearly <span style={{ color: "#22c55e", fontSize: "12px" }}>(Save 25%)</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "25px", maxWidth: "1100px", margin: "0 auto" }}>
          
          {/* Student Trial Plan */}
          <div style={{ background: "linear-gradient(180deg, #18181b 0%, #09090b 100%)", border: "2px solid #22c55e", borderRadius: "16px", padding: "30px", textAlign: "left", position: "relative", boxShadow: "0 0 25px rgba(34, 197, 94, 0.15)" }}>
            <span style={{ position: "absolute", top: "-12px", right: "20px", background: "#22c55e", color: "#000", fontSize: "11px", padding: "4px 10px", borderRadius: "20px", fontWeight: "800", letterSpacing: "0.5px" }}>1-DAY FREE TRIAL</span>
            <h3 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "8px" }}>Student Pass</h3>
            <p style={{ color: "#a1a1aa", fontSize: "13px", marginBottom: "20px" }}>Perfect for college exam prep & quick applications.</p>
            <div style={{ fontSize: "32px", fontWeight: "800", marginBottom: "20px" }}>₹49 <span style={{ fontSize: "13px", color: "#a1a1aa", fontWeight: "normal" }}>/ week</span></div>
            <ul style={{ listStyle: "none", padding: 0, color: "#d4d4d8", fontSize: "14px", marginBottom: "30px", lineHeight: "2.2" }}>
              <li>✨ 1-Day Full Pro Trial</li>
              <li>✨ AI Cover Letter Generator</li>
              <li>✨ Skill Gap Analysis</li>
            </ul>
            <button 
              onClick={() => handleSubscribe("Student Pass", "₹49/week")}
              disabled={loadingPlan === "Student Pass"}
              style={{ width: "100%", padding: "12px", borderRadius: "10px", background: "#22c55e", color: "#000", border: "none", fontWeight: "bold", cursor: "pointer", fontSize: "14px", boxShadow: "0 4px 12px rgba(34, 197, 94, 0.3)", opacity: loadingPlan === "Student Pass" ? 0.7 : 1 }}
            >
              {loadingPlan === "Student Pass" ? "Processing Trial..." : "Start Free Trial"}
            </button>
          </div>

          {/* Pro Membership */}
          <div style={{ background: "linear-gradient(180deg, #18181b 0%, #09090b 100%)", border: "2px solid #6366f1", borderRadius: "16px", padding: "30px", textAlign: "left", position: "relative", boxShadow: "0 0 25px rgba(99, 102, 241, 0.2)" }}>
            <span style={{ position: "absolute", top: "-12px", right: "20px", background: "#6366f1", color: "#fff", fontSize: "11px", padding: "4px 10px", borderRadius: "20px", fontWeight: "800", letterSpacing: "0.5px" }}>POPULAR</span>
            <h3 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "8px" }}>Pro Membership</h3>
            <p style={{ color: "#a1a1aa", fontSize: "13px", marginBottom: "20px" }}>Advanced AI tools & priority visibility.</p>
            <div style={{ fontSize: "32px", fontWeight: "800", marginBottom: "20px" }}>
              {billingCycle === "monthly" ? "₹499" : "₹379"} <span style={{ fontSize: "13px", color: "#a1a1aa", fontWeight: "normal" }}>/ month</span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, color: "#d4d4d8", fontSize: "14px", marginBottom: "30px", lineHeight: "2.2" }}>
              <li>🚀 Unlimited AI Cover Letters</li>
              <li>🚀 Priority Recruiter Visibility</li>
              <li>🚀 Advanced Skill Gap Analysis</li>
              <li>🚀 Unlimited Resume Parsing</li>
            </ul>
            <button 
              onClick={() => handleSubscribe("Pro Membership", billingCycle === "monthly" ? "₹499/month" : "₹379/month")}
              disabled={loadingPlan === "Pro Membership"}
              style={{ width: "100%", padding: "12px", borderRadius: "10px", background: "#6366f1", color: "#fff", border: "none", fontWeight: "bold", cursor: "pointer", fontSize: "14px", boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)", opacity: loadingPlan === "Pro Membership" ? 0.7 : 1 }}
            >
              {loadingPlan === "Pro Membership" ? "Connecting Gateway..." : "Upgrade to Pro"}
            </button>
          </div>

          {/* Enterprise Plan */}
          <div style={{ background: "linear-gradient(180deg, #18181b 0%, #09090b 100%)", border: "2px solid #06b6d4", borderRadius: "16px", padding: "30px", textAlign: "left", position: "relative", boxShadow: "0 0 25px rgba(6, 182, 212, 0.15)" }}>
            <span style={{ position: "absolute", top: "-12px", right: "20px", background: "#06b6d4", color: "#000", fontSize: "11px", padding: "4px 10px", borderRadius: "20px", fontWeight: "800", letterSpacing: "0.5px" }}>TEAM / B2B</span>
            <h3 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "8px" }}>Enterprise</h3>
            <p style={{ color: "#a1a1aa", fontSize: "13px", marginBottom: "20px" }}>For teams and professional recruiters.</p>
            <div style={{ fontSize: "32px", fontWeight: "800", marginBottom: "20px" }}>
              {billingCycle === "monthly" ? "₹2,499" : "₹1,899"} <span style={{ fontSize: "13px", color: "#a1a1aa", fontWeight: "normal" }}>/ month</span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, color: "#d4d4d8", fontSize: "14px", marginBottom: "30px", lineHeight: "2.2" }}>
              <li>⚡ Unlimited Job Postings</li>
              <li>⚡ Bulk Resume Export to CSV</li>
              <li>⚡ AI Candidate Ranking Dashboard</li>
              <li>⚡ Direct Interview Scheduling</li>
            </ul>
            <button 
              onClick={() => handleSubscribe("Enterprise Plan", billingCycle === "monthly" ? "₹2,499/month" : "₹1,899/month")}
              disabled={loadingPlan === "Enterprise Plan"}
              style={{ width: "100%", padding: "12px", borderRadius: "10px", background: "#06b6d4", color: "#000", border: "none", fontWeight: "bold", cursor: "pointer", fontSize: "14px", boxShadow: "0 4px 12px rgba(6, 182, 212, 0.3)", opacity: loadingPlan === "Enterprise Plan" ? 0.7 : 1 }}
            >
              {loadingPlan === "Enterprise Plan" ? "Processing..." : "Contact Sales"}
            </button>
          </div>

        </div>
      </section>
    </div>
  );
}