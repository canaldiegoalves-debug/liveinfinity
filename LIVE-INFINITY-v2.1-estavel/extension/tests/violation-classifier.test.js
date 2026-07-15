function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function classifyViolationText(rawText) {
  const text = normalize(rawText).toLowerCase();
  if (!text || text.length < 8 || text.length > 1200) {
    return { detected: false, score: 0 };
  }

  let score = 0;
  if (/\bviola[cç][aã]o\b/.test(text)) score += 7;
  if (/diretrizes da comunidade|community guidelines/.test(text)) score += 7;
  if (/aviso de pol[ií]tica|policy warning/.test(text)) score += 6;
  if (/conte[uú]do (?:proibido|restrito|inadequado)|prohibited content|restricted content/.test(text)) score += 6;
  if (/advert[eê]ncia|warning/.test(text)) score += 4;
  if (/puni[cç][aã]o|penalidade|penalty|strike/.test(text)) score += 5;
  if (/risco de (?:suspens[aã]o|restri[cç][aã]o)|conta pode ser suspensa/.test(text)) score += 6;
  if (/live|transmiss[aã]o|stream/.test(text)) score += 2;
  if (/encerrad[ao]|interrompid[ao]|finalizad[ao]|suspens[aã]o|bloquead[ao]|restri[cç][aã]o/.test(text)) score += 4;
  if (/remova|corrija|pare|interrompa|encerre agora|take action/.test(text)) score += 2;

  const hasStrong = /viola[cç][aã]o|diretrizes da comunidade|aviso de pol[ií]tica|conte[uú]do (?:proibido|restrito)|advert[eê]ncia|warning|puni[cç][aã]o|penalidade|strike/.test(text);
  return { detected: score >= 8 && hasStrong, score };
}

const cases = [
  {
    name: "critical portuguese",
    text: "Aviso de violação das Diretrizes da Comunidade. Sua transmissão ao vivo pode ser encerrada e sua conta pode receber uma penalidade.",
    expected: true
  },
  {
    name: "policy warning",
    text: "Policy warning: your LIVE stream may be interrupted due to restricted content.",
    expected: true
  },
  {
    name: "generic dashboard notice",
    text: "Avisos e notificações da sua transmissão aparecem aqui.",
    expected: false
  },
  {
    name: "normal sales text",
    text: "Cliente comprou o produto número 1.",
    expected: false
  },
  {
    name: "coupon warning",
    text: "Aviso: o cupom de desconto termina em 10 minutos.",
    expected: false
  }
];

let failures = 0;

for (const test of cases) {
  const result = classifyViolationText(test.text);
  const pass = result.detected === test.expected;
  console.log(`${pass ? "PASS" : "FAIL"} ${test.name} score=${result.score}`);
  if (!pass) failures += 1;
}

if (failures) process.exit(1);
console.log("All violation classifier tests passed.");
