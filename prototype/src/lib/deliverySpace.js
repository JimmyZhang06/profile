// Only aggregate measurements reach the model. Names, contacts and education
// identities occupy measured space on the client without becoming prompt data.
export function pageWritingBudget(space, context) {
  const bounded = (n, min, max, fallback) => Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
  const availableLines = bounded(space?.lines, 1, 65, 38);
  const columns = bounded(space?.columns, 16, 72, 43);
  const fields = Array.isArray(context.fields) ? context.fields : [];
  const projects = Math.min(2, context.sources?.length || 0);
  const work = Math.min(2, fields.filter((f) => f?.kind === 'workEntries').length);
  const research = Math.min(1, fields.filter((f) => f?.kind === 'researchEntries').length);
  const profileFields = fields.filter((f) => f.kind === 'profile' && f.text?.trim());
  const sectionCount = [projects, work, research].filter(Boolean).length + profileFields.length;
  // Each block needs its title and breathing room. Short final lines and
  // separate bullets cost a physical line even when most of it is empty.
  const bodyLines = Math.max(2, availableLines - Math.ceil(sectionCount * 1.8) - projects - work - research - 2);
  const characters = Math.max(28, Math.floor(bodyLines * columns * 0.9));
  const summary = profileFields.some((f) => f.id === 'summary') ? Math.min(80,Math.round(characters * 0.08)) : 0;
  const skills = profileFields.some((f) => f.id === 'skills') ? Math.min(60,Math.round(characters * 0.06)) : 0;
  const perProject = Math.round((characters-summary-skills) / Math.max(1, work * 1.2 + projects + research * 0.8));
  return {availableLines, columns, bodyLines, characters, summary, skills, perProject, perWork:Math.round(perProject * 1.2), perResearch:Math.round(perProject * 0.8)};
}
