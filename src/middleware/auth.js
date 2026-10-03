const { prisma } = require('../lib/db');
const { HOME_BY_ROLE } = require('../config/auth');

// Loads the logged-in user on every request that carries a session.
// A user who has been suspended or deleted is logged out on their next request.
async function loadUser(req, res, next) {
  req.user = null;
  res.locals.currentUser = null;

  const userId = req.session && req.session.userId;
  if (!userId) return next();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    delete req.session.userId;
    return next();
  }

  req.user = user;
  res.locals.currentUser = { ...user, homePath: HOME_BY_ROLE[user.role] };
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

// Sends already-logged-in users to their dashboard instead of the login page.
function redirectIfLoggedIn(req, res, next) {
  if (req.user) return res.redirect(HOME_BY_ROLE[req.user.role]);
  next();
}

module.exports = { loadUser, requireLogin, requireRole, redirectIfLoggedIn };
