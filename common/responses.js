const functions = require('./functions');

module.exports = () => (req, res, next) => {
  res.success = (message, data, number) => {
    message = functions.prettyCase(message);
    return res.send({ statusCode: 200, message, data: data || {}, status: number || 1 });
  };

  res.error = (code, message, data) => {
    message = functions.prettyCase(message);
    res.status(400).send({ statusCode: code, message, data: data || {}, status: 0 });
  };

  next();
};
