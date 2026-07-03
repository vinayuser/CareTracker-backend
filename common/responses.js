const functions = require('./functions');

module.exports = () => (req, res, next) => {
  res.success = (message, data, number) => {
    message = functions.prettyCase(message);
    return res.status(200).send({ statusCode: 200, message, data: data || {}, status: number || 1 });
  };

  res.error = (code, message, data) => {
    message = functions.prettyCase(message);
    const status = Number(code) || 400;
    res.status(status).send({ statusCode: status, message, data: data || {}, status: 0 });
  };

  next();
};
