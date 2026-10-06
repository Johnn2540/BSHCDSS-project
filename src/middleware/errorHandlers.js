function notFound(req, res, message) {
  res.locals.noindex = true;
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.status(404).render('public/404', { title: 'Page not found', message: typeof message === 'string' ? message : null });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Headers already sent (e.g. a failed file download): let Express close the connection.
  if (res.headersSent) return next(err);
  res.locals.noindex = true;
  res.set('X-Robots-Tag', 'noindex, nofollow');

  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('public/error', {
      title: 'Form expired',
      status: 403,
      message: 'This form has expired or is invalid. Please go back, refresh the page and try again.',
    });
  }

  const status = err.status || err.statusCode || 500;
  if (status === 404) return notFound(req, res, err.expose && err.message !== 'Page not found' ? err.message : null);
  if (status >= 500) console.error(err);

  res.status(status).render('public/error', {
    title: 'Error',
    status,
    message: status >= 500 ? 'Something went wrong. Please try again later.' : err.expose ? err.message : 'The request could not be completed.',
  });
}

module.exports = { notFound, errorHandler };
