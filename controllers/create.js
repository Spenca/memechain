/**
 * GET /login
 * Login page.
 */
exports.getCreate = (req, res) => {
  res.render('create', {
    title: 'Create'
  });
};