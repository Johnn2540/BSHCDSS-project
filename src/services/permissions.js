const { HOME_BY_ROLE } = require('../config/auth');

// Account management is reserved for the original ADMIN role. A delegated tutor
// can manage content, but cannot alter accounts or grant administration access.
function permissionsFor(user) {
  const active = user?.status === 'ACTIVE';
  const manageAccounts = active && user.role === 'ADMIN';
  const manageContent = manageAccounts || (active && user.role === 'TUTOR' && user.canManageContent === true);
  return { manageAccounts, manageContent };
}

function homeForUser(user) {
  return permissionsFor(user).manageContent ? '/admin' : HOME_BY_ROLE[user?.role] || '/login';
}

module.exports = { permissionsFor, homeForUser };
