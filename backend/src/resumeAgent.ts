// Common skills list to match against resume text
const KEYWORD_SKILLS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "Express",
  "Python",
  "Machine Learning",
  "SQL",
  "HTML",
  "CSS",
  "Tailwind",
  "Git",
  "Docker",
  "AWS",
  "MongoDB",
];

export function parseResumeText(text: string) {
  const extractedSkills: string[] = [];

  if (text) {
    KEYWORD_SKILLS.forEach((skill) => {
      // Escape special characters like '.' in Next.js or Node.js
      const escapedSkill = skill.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const regex = new RegExp(`\\b${escapedSkill}\\b`, "i");
      if (regex.test(text)) {
        extractedSkills.push(skill);
      }
    });
  }

  return { extractedSkills };
}
export function calculateJobMatch(
  userSkills: string[],
  jobSkills: string[]
): number {
  if (!jobSkills || jobSkills.length === 0) return 70;

  const userSkillsLower = userSkills.map((s) => s.toLowerCase());
  const matched = jobSkills.filter((skill) =>
    userSkillsLower.includes(skill.toLowerCase())
  );

  const matchRatio = matched.length / jobSkills.length;
  // Base score 40% + up to 60% based on skill matching
  const score = Math.round(40 + matchRatio * 60);

  return Math.min(100, Math.max(50, score));
}