export function validateQuestion({ maxLength, onReject }) {
  return function validate(req, res, next) {
    const raw = req.body?.message;

    if (typeof raw !== 'string') {
      onReject?.('missing_message');
      res.status(422).json({ error: 'DANA_VALIDATION' });
      return;
    }

    const question = raw.trim();

    if (question.length === 0) {
      onReject?.('empty_message');
      res.status(422).json({ error: 'DANA_VALIDATION' });
      return;
    }

    if (question.length > maxLength) {
      onReject?.('message_too_long');
      res.status(413).json({ error: 'DANA_CONTEXT_LENGTH' });
      return;
    }

    req.question = question;
    next();
  };
}
