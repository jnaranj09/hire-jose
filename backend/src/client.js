export function clientIp(req) {
  return req.get('cf-connecting-ip') || req.socket.remoteAddress || 'unknown';
}

export function userAgent(req) {
  return (req.get('user-agent') || 'none').slice(0, 120);
}
