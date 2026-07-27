export const mockRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

export const mockReq = ({ params = {}, body = {}, query = {}, user } = {}) => ({
  params,
  body,
  query,
  user,
});
