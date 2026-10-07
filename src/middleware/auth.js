const { prisma } = require('../lib/db');
const { permissionsFor, homeForUser } = require('../services/permissions');

// Loads the logged-in user on every request that carries a session.
// A user who has been suspended or deleted is logged out on their next request.
async function loadUser(req, res, next) {
  req.user = null;
  res.locals.currentUser = null;

  const userId = req.session && req.session.userId;
  if (!userId) return next();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, status: true, canManageContent: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    delete req.session.userId;
    return next();
  }

  req.user = user;
  res.locals.currentUser = { ...user, homePath: homeForUser(user), permissions: permissionsFor(user) };
  next();
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  req.flash('info', 'Please log in to continue.');
  res.redirect('/login');
}

// Usage: requireRole('ADMIN') or requireRole('TUTOR', 'ADMIN'). Use after requireLogin.
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    res.status(403).render('public/error', {
      title: 'Access denied',
      status: 403,
      message: 'You do not have permission to view this page.',
    });
  };
}

// Use after requireLogin. Permissions come from the current database record,
// never from form fields, query parameters or cached session claims.
function requirePermission(permission) {
  return (req, res, next) => {
    if (permissionsFor(req.user)[permission] === true) return next();
    res.status(403).render('public/error', {
      title: 'Access denied', status: 403,
      message: 'You do not have permission to perform this action.',
    });
  };
}

// Sends already-logged-in users to their dashboard instead of the login page.
function redirectIfLoggedIn(req, res, next) {
  if (req.user) return res.redirect(homeForUser(req.user));
  next();
}

module.exports = { loadUser, requireLogin, requireRole, requirePermission, redirectIfLoggedIn };
