export const mockRes = () => {
  const res = { statusCode: 200, body: undefined, cookies: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  res.cookie = (name, value, options) => { res.cookies[name] = { value, options }; return res; };
  return res;
};

export const mockReq = ({ params = {}, body = {}, query = {}, user } = {}) => ({
  params,
  body,
  query,
  user,
});
