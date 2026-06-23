const jwt = require('jsonwebtoken');
const Model = require('../models/index');

const tokenBlacklist = new Set();

const PORTAL_ROLES = {
  super_admin: 'super_admin',
  agency_owner: 'agency_owner',
  hr: 'hr',
  caregiver: 'caregiver',
};

module.exports.authenticate = (...args) => async (req, res, next) => {
  try {
    if (tokenBlacklist.has(req.headers.authorization)) {
      return res.status(401).send({
        statusCode: 401,
        message: 'UNAUTHORIZED ACCESS',
        data: {},
        status: 0,
        isSessionExpired: true,
      });
    }

    const roles = [].concat(args).map((role) => role.toLowerCase());
    const token = String(req.headers.authorization || '')
      .replace(/bearer|jwt/i, '')
      .replace(/^\s+|\s+$/g, '');

    let decoded;
    if (token) decoded = module.exports.verifyToken(token);

    let doc = null;
    let role = '';

    if (!decoded && roles.includes('guest')) {
      return next();
    }

    if (decoded != null && roles.includes(PORTAL_ROLES.super_admin)) {
      role = PORTAL_ROLES.super_admin;
      doc = await Model.AdminModel.findOne({ _id: decoded._id });
    }

    if (
      !doc &&
      decoded != null &&
      (roles.includes(PORTAL_ROLES.agency_owner) ||
        roles.includes(PORTAL_ROLES.hr) ||
        roles.includes(PORTAL_ROLES.caregiver))
    ) {
      const account = await Model.AgencyAccountModel.findOne({ _id: decoded._id }).populate('agencyId');
      if (account && account.status !== 'Inactive') {
        const accountRole = String(account.role || 'AGENCY_OWNER').toLowerCase();
        if (roles.includes(accountRole)) {
          role = accountRole;
          doc = account;
        }
      }
    }

    if (!doc) {
      return res.status(401).send({
        statusCode: 401,
        message: 'UNAUTHORIZED ACCESS',
        data: {},
        status: 0,
        isSessionExpired: true,
        isDeleted: false,
      });
    }

    if (role) req[role] = doc.toJSON();
    next();
  } catch (error) {
    console.error(error);
    const message = String(error.name).toLowerCase() === 'error' ? error.message : 'UNAUTHORIZED ACCESS';
    return res.error(401, message);
  }
};

module.exports.getToken = (data) =>
  jwt.sign(data, process.env.JWT_TOKEN_KEY, {
    expiresIn: '30 days',
  });

module.exports.verifyToken = (token) => jwt.verify(token, process.env.JWT_TOKEN_KEY);

module.exports.logoutToken = (req, res, next) => {
  const token = req.headers.authorization;
  tokenBlacklist.add(token);
  next();
};
