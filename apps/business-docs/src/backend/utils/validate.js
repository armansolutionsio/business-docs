// Validador minimo sin dependencias. Devuelve { ok, errors, value }.
// Uso:
//   const { ok, errors, value } = validate(req.body, {
//     nombre: { type: 'string', required: true, max: 200 },
//     monto:  { type: 'number', min: 0 },
//     email:  { type: 'string', pattern: /^[^@]+@[^@]+\.[^@]+$/ },
//   });
//   if (!ok) return res.status(400).json({ error: 'Validacion fallida', errors });

function validate(input, schema) {
  const errors = {};
  const value = {};
  const obj = input || {};

  for (const [key, rule] of Object.entries(schema)) {
    let v = obj[key];

    if (v === undefined || v === null || v === '') {
      if (rule.required) errors[key] = 'requerido';
      else if (rule.default !== undefined) value[key] = rule.default;
      continue;
    }

    if (rule.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) { errors[key] = 'debe ser numero'; continue; }
      if (rule.min !== undefined && n < rule.min) { errors[key] = `min ${rule.min}`; continue; }
      if (rule.max !== undefined && n > rule.max) { errors[key] = `max ${rule.max}`; continue; }
      value[key] = n;
      continue;
    }

    if (rule.type === 'string') {
      const s = String(v);
      if (rule.max && s.length > rule.max) { errors[key] = `max ${rule.max} caracteres`; continue; }
      if (rule.min && s.length < rule.min) { errors[key] = `min ${rule.min} caracteres`; continue; }
      if (rule.pattern && !rule.pattern.test(s)) { errors[key] = 'formato invalido'; continue; }
      if (rule.in && !rule.in.includes(s))      { errors[key] = `debe ser uno de: ${rule.in.join(', ')}`; continue; }
      value[key] = s;
      continue;
    }

    if (rule.type === 'boolean') {
      value[key] = !!v;
      continue;
    }

    if (rule.type === 'date') {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) { errors[key] = 'fecha invalida'; continue; }
      value[key] = v;
      continue;
    }

    if (rule.type === 'array') {
      if (!Array.isArray(v)) { errors[key] = 'debe ser array'; continue; }
      value[key] = v;
      continue;
    }

    if (rule.type === 'object') {
      if (typeof v !== 'object' || Array.isArray(v)) { errors[key] = 'debe ser objeto'; continue; }
      value[key] = v;
      continue;
    }

    value[key] = v;
  }

  return { ok: Object.keys(errors).length === 0, errors, value };
}

// Helper middleware
function validateBody(schema) {
  return (req, res, next) => {
    const r = validate(req.body, schema);
    if (!r.ok) return res.status(400).json({ error: 'Validacion fallida', errors: r.errors });
    req.validated = r.value;
    next();
  };
}

module.exports = { validate, validateBody };
