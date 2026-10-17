const EMAIL = /^([a-zA-Z0-9]+)*@example\.com$/;
module.exports = (s) => EMAIL.test(s);
