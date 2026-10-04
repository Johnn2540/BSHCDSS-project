// Presentation data only. Profile details and ordering remain managed in the CMS.
function initialsFor(name) {
  const words = String(name || '').replace(/^(?:(?:Dr|Prof|Mr|Mrs|Ms|Eng)\.\s*|(?:Dr|Prof|Mr|Mrs|Ms|Eng)\s+)+/i, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

function buildTeamPresentation(members) {
  const profiles = members.map((member) => ({ ...member, initials: initialsFor(member.name) }));
  const keyMembers = profiles.filter((member) => member.referenceCode);
  const leader = keyMembers.find((member) => member.referenceCode === 'K-1') || null;
  return {
    leader,
    specialists: keyMembers.filter((member) => member !== leader),
    support: profiles.filter((member) => !member.referenceCode),
    keyCount: keyMembers.length,
    total: profiles.length,
  };
}

module.exports = { initialsFor, buildTeamPresentation };
