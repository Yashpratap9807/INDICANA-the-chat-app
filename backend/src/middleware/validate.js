const { validationResult } = require('express-validator');

/**
 * Runs after express-validator chains.
 * Returns 422 with structured errors if validation failed.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  next();
}

module.exports = { handleValidationErrors };
