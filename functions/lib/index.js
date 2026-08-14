"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePreset = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
/**
 * Proxy da chave compartilhada da DeepSeek.
 *
 * A chave do dono fica num segredo do servidor (DEEPSEEK_API_KEY) e NUNCA
 * chega ao browser de quem usa — diferente da chave própria, que vive no
 * localStorage de cada usuário e chama a API direto (ver apps/web/src/lib/
 * deepseek.ts). Este proxy só roda pra quem não tem chave própria E está
 * autorizado pelo dono (config/app.ownerUid ou access/{uid}.allowed).
 */
const CHAT_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const TIMEOUT_MS = 90_000;
/**
 * Cópia mínima do profile cube-baby (packages/profiles) + prompt builder
 * (apps/web/src/lib/deepseek.ts). Duplicada de propósito: o deploy de
 * Functions não resolve workspaces do monorepo sem engenharia extra.
 * Ao mexer no profile, atualize aqui também.
 */
const PARAMETERS = [
    {
        id: 'type',
        label: 'Preamp',
        min: 0,
        max: 8,
        options: [
            { value: 0, label: 'Power-Zone Clean' },
            { value: 1, label: 'US Gold 100 Clean' },
            { value: 2, label: 'Two Stone Coral OD' },
            { value: 3, label: 'Doctor3 B' },
            { value: 4, label: 'Cali JP A' },
            { value: 5, label: 'Day Tripper OD' },
            { value: 6, label: 'Shittcow Dist' },
            { value: 7, label: 'Wo Stone Coral OD' },
            { value: 8, label: 'Mr Smith Dist' },
        ],
    },
    { id: 'gain', label: 'Gain', min: 0, max: 7 },
    { id: 'tone', label: 'Tone', min: 0, max: 15 },
    {
        id: 'mod',
        label: 'Mod',
        min: 0,
        max: 15,
        zones: [
            { label: 'Chorus', min: 0, max: 6 },
            { label: 'Off', min: 7, max: 8 },
            { label: 'Phaser', min: 9, max: 15 },
        ],
    },
    { id: 'time', label: 'Time', min: 0, max: 31 },
    { id: 'fb', label: 'Feedback', min: 0, max: 127 },
    { id: 'mix', label: 'Mix', min: 0, max: 118 },
    { id: 'reverb', label: 'Reverb', min: 0, max: 15 },
    {
        id: 'ir_cab',
        label: 'IR Cab',
        min: 0,
        max: 8,
        options: [
            { value: 0, label: 'IR desligado' },
            { value: 1, label: 'Line 6 Vetta 1x12' },
            { value: 2, label: 'Marshall 1960AV 4x12' },
            { value: 3, label: 'Marshall 1960A T75 4x12' },
            { value: 4, label: 'VHT Deliverance 2x12' },
            { value: 5, label: 'Soldano 2x12' },
            { value: 6, label: 'Peavey 5150 + Mesa 4x12' },
            { value: 7, label: 'JSX KT77 + Mesa 4x12' },
            { value: 8, label: 'Diezel V30 SM57 4x12' },
        ],
    },
    { id: 'volume', label: 'Volume', min: 0, max: 127 },
];
const DEFAULTS = {
    type: 4,
    gain: 4,
    tone: 8,
    mod: 7,
    time: 12,
    fb: 40,
    mix: 30,
    reverb: 6,
    ir_cab: 4,
    volume: 100,
};
function clampValues(values) {
    const out = {};
    for (const p of PARAMETERS) {
        const v = values[p.id];
        if (typeof v !== 'number' || Number.isNaN(v)) {
            out[p.id] = DEFAULTS[p.id] ?? p.min;
            continue;
        }
        out[p.id] = Math.min(p.max, Math.max(p.min, Math.round(v)));
    }
    return out;
}
function buildSystemPrompt(guitar) {
    const params = PARAMETERS.map((p) => {
        if (p.options) {
            const opts = p.options.map((o) => `${o.value}="${o.label}"`).join(', ');
            return `- ${p.id} (${p.label}): inteiro de ${p.min} a ${p.max}. Opções: ${opts}.`;
        }
        const zones = p.zones
            ? ` Zonas: ${p.zones.map((z) => `${z.label}=${z.min}-${z.max}`).join(', ')}.`
            : '';
        return `- ${p.id} (${p.label}): inteiro de ${p.min} a ${p.max}.${zones}`;
    }).join('\n');
    return [
        `Você é um guitarrista experiente montando UM preset na pedaleira Cube Baby (Cuvave/M-VAVE).`,
        ``,
        `Cadeia de efeitos (fixa): Tuner → Preamp → Phaser/Chorus → Delay → Reverb → IR CAB.`,
        ``,
        `Parâmetros — use SOMENTE inteiros dentro dos limites indicados. Os nomes de`,
        `preamp e gabinete abaixo são os REAIS desta pedaleira: não invente outros`,
        `nem use nomes parecidos de outras marcas.`,
        params,
        ``,
        `Semântica de desligado (importante):`,
        `- mix=0 desliga o delay`,
        `- reverb=0 desliga o reverb`,
        `- mod entre 7 e 8 desliga a modulação (0-6 = chorus, 9-15 = phaser)`,
        `- ir_cab=0 desliga o simulador de gabinete`,
        ``,
        guitar
            ? `A guitarra é: ${guitar}. Sugira a posição de captador que melhor serve a música nessa guitarra.`
            : `Sugira a posição de captador (braço, meio ou ponte) que melhor serve a música.`,
        ``,
        `Responda SOMENTE com JSON válido, sem markdown, neste formato:`,
        `{"name":"...","pickup":"...","preset":{...},"explanation":"..."}`,
        ``,
        `- "name": rótulo curto (1-3 palavras) do timbre, ex: "Clean chorus", "Blues lead".`,
        `- "pickup": posição do captador em 1-2 palavras, ex: "braço", "ponte".`,
        `- "preset": TODOS os parâmetros listados acima.`,
        `- "explanation": 2-3 frases em português do Brasil, citando os valores concretos`,
        `  e por que servem para ESTA música. Direto ao ponto, sem encher linguiça.`,
    ].join('\n');
}
function stripFences(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('```'))
        return trimmed;
    return trimmed
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
}
exports.generatePreset = (0, https_1.onCall)({ secrets: ['DEEPSEEK_API_KEY'], timeoutSeconds: 120, memory: '256MiB' }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Entre com o Google primeiro.');
    }
    // Autorização: o dono sempre pode; os outros precisam de aprovação.
    const configSnap = await db.doc('config/app').get();
    const ownerUid = configSnap.exists
        ? configSnap.data()?.ownerUid
        : undefined;
    if (uid !== ownerUid) {
        const accessSnap = await db.doc(`access/${uid}`).get();
        if (!accessSnap.exists || accessSnap.data()?.allowed !== true) {
            throw new https_1.HttpsError('permission-denied', 'Sua conta não tem acesso à chave compartilhada. Peça acesso ou configure a sua própria chave.');
        }
    }
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'A chave compartilhada não foi configurada no servidor ainda.');
    }
    const { song, hint, guitar } = req.data;
    if (!song || !song.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Nome da música é obrigatório.');
    }
    const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
            model: MODEL,
            response_format: { type: 'json_object' },
            temperature: 1.0,
            messages: [
                { role: 'system', content: buildSystemPrompt(guitar) },
                {
                    role: 'user',
                    content: `Monte um preset para tocar "${song.trim()}".${hint ? ` Contexto extra do guitarrista: ${hint}` : ''}`,
                },
            ],
        }),
    });
    if (!res.ok) {
        if (res.status === 401)
            throw new https_1.HttpsError('failed-precondition', 'A chave compartilhada foi recusada pela DeepSeek — o dono precisa verificar o segredo.');
        if (res.status === 402)
            throw new https_1.HttpsError('failed-precondition', 'A conta DeepSeek do dono está sem saldo.');
        if (res.status === 429)
            throw new https_1.HttpsError('resource-exhausted', 'Muitas gerações ao mesmo tempo. Espere alguns segundos.');
        throw new https_1.HttpsError('internal', `A DeepSeek recusou a requisição (HTTP ${res.status}).`);
    }
    const data = (await res.json().catch(() => null));
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new https_1.HttpsError('internal', 'A DeepSeek respondeu vazio.');
    }
    let parsed;
    try {
        parsed = JSON.parse(stripFences(content));
    }
    catch {
        throw new https_1.HttpsError('internal', 'A IA respondeu num formato inesperado. Tente de novo.');
    }
    if (!parsed.preset || typeof parsed.preset !== 'object') {
        throw new https_1.HttpsError('internal', 'A resposta da IA veio sem o preset.');
    }
    const values = clampValues({ ...DEFAULTS, ...parsed.preset });
    const text = (raw, max, fallback) => typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, max) : fallback;
    const result = {
        song: song.trim(),
        name: text(parsed.name, 28, 'Preset gerado'),
        pickup: text(parsed.pickup, 16, ''),
        values,
        explanation: text(parsed.explanation, 600, ''),
        usage: data?.usage
            ? {
                prompt: data.usage.prompt_tokens ?? 0,
                completion: data.usage.completion_tokens ?? 0,
                total: data.usage.total_tokens ?? 0,
            }
            : undefined,
    };
    return result;
});
