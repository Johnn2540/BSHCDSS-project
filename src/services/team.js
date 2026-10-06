// Presentation data only. Profile details and ordering remain managed in the CMS.
function initialsFor(name) {
  const words = String(name || '').replace(/^(?:(?:Dr|Prof|Mr|Mrs|Ms|Eng)\.\s*|(?:Dr|Prof|Mr|Mrs|Ms|Eng)\s+)+/i, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

function whatsappUrlFor(number) {
  const value = String(number || '').trim();
  if (!/^\+[\d\s().-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}`;
}

function buildTeamPresentation(members) {
  const profiles = members.map((member) => ({
    ...member,
    initials: initialsFor(member.name),
    whatsappUrl: whatsappUrlFor(member.whatsappNumber),
  }));
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

module.exports = { initialsFor, whatsappUrlFor, buildTeamPresentation };
