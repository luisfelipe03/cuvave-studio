# Cuvave Studio

Editor web de presets para pedaleiras da família **Cuvave/M-VAVE** (Cube Baby,
Tank-G e futuros modelos), com geração de presets por IA.

Sem instalação: abre o link no **Chrome ou Edge**, conecta o pedal via USB,
edita, salva e compartilha.

> **Aviso**: este é um projeto pessoal de código aberto, **não afiliado** à
> Cuvave nem à M-VAVE. O protocolo de comunicação foi descoberto por engenharia
> reversa independente (ver [Referências](#referencias-e-agradecimentos)).

## ✨ Features

- **Editor de presets** — lê e escreve os 3 presets do Cube Baby (A/B/C)
- **IRs** — importa arquivos WAV de cab sim pro pedal
- **IA** — digita o nome de uma música e a IA gera um preset com explicação
  de cada escolha (DeepSeek)
- **Multi-pedal** — arquitetura de device profiles: um pedal novo entra como
  um profile declarativo, sem mexer no core
- **Nada de instalação** — um único link (Firebase Hosting), funciona em
  Windows, macOS e Android (Chrome/Edge + OTG)

## Como funciona

```
nome da música ──▶ DeepSeek ──▶ JSON validado ──▶ SysEx ──▶ Web MIDI ──▶ pedal
                    (IA)        (clamp + schema)   (core)   (Chrome/Edge)
```

O pedal é um dispositivo **USB MIDI class-compliant**: o navegador fala com
ele via **Web MIDI API** (`navigator.requestMIDIAccess({ sysex: true })`).
Toda a comunicação é SysEx (`F0 ... F7`) com framing próprio da família
Cuvave — o core do protocolo vive em `packages/protocol`, em TypeScript puro.

## Requisitos

- **Chrome ou Edge** (Chromium) — Safari e Firefox não suportam Web MIDI
- Pedal da família Cuvave/M-VAVE conectado via USB
- Pra usar a IA: uma API key da [DeepSeek](https://platform.deepseek.com/)
  (de cada usuário, configurada no próprio app)

## Stack

| Camada | Tecnologia |
|---|---|
| UI | React 19 + Vite + TypeScript |
| Transporte | Web MIDI API (Chrome/Edge) |
| IA | DeepSeek API (`deepseek-chat`), chamada direta do browser |
| Infra | Firebase Hosting + Auth + Firestore + Storage (plano grátis) |
| Monorepo | npm workspaces (`packages/*`, `apps/*`) |

## Estrutura

```
packages/protocol   ← core do protocolo: framing SysEx, bit-shift 7 bits,
                      checksum, comandos (Init, NameVersion, Erase,
                      WriteMemory, ReadMemory)          [implementação no M1]
packages/profiles   ← perfis de dispositivo (cube-baby, tank-g...):
                      memoryMap, parameters, irFormat, buildSysEx   [M2]
apps/web            ← app React + Vite + Web MIDI + Firebase
cuvave-spec.md      ← especificação completa (protocolo, RE, roadmap)
```

## Rodando localmente

```sh
npm install
npm run dev        # http://localhost:5173
```

Build de produção:

```sh
npm run build      # gera apps/web/dist
```

## Deploy (Firebase)

1. `npm install -g firebase-tools` e `firebase login`
2. `firebase init hosting` (pasta pública: `apps/web/dist`) — Auth, Firestore
   e Storage são criados no console do Firebase
3. `npm run build && firebase deploy`

### A config do Firebase é pública (e tudo bem)

A config web (`apiKey`, `projectId`, `appId`...) aparece no código-fonte e no
bundle — **não é segredo**. Ela apenas identifica o projeto; o que protege os
dados são as **Security Rules** (cada usuário só lê/escreve os próprios
documentos) e o Firebase Auth. Nunca coloque no repo chaves de service account
ou credenciais do Google Cloud — essas sim são secretas.

### API key da DeepSeek

Cada usuário cola a própria key no app (fica no `localStorage` dele, nunca no
código). O browser chama `api.deepseek.com` diretamente (CORS liberado pela
DeepSeek — sem proxy, sem backend).

## Roadmap

| # | Etapa |
|---|---|
| M1 | Validar protocolo com o pedal físico (Web MIDI, dump de memória) |
| M2 | Editor manual dos 3 presets + primeiro deploy |
| M3 | Envio de IRs |
| M4 | Gerador de presets por IA |
| M5 | Refino de UI/UX |
| M6 | Firebase Auth + Firestore (presets na nuvem, compartilhar com amigos) |
| M7 | Profile do Tank-G |

Ver [`cuvave-spec.md`](./cuvave-spec.md) para o detalhe completo.

## Referências e agradecimentos

- [pferreir/cuvave-midi](https://github.com/pferreir/cuvave-midi) — engenharia
  reversa do protocolo do Cube Baby (base deste projeto, GPL-3)
- [cbix/mvave-chocolate-sysex](https://github.com/cbix/mvave-chocolate-sysex) —
  framing SysEx da família Cuvave
- [hudsonbrendon/ha-mvave-tankg](https://github.com/hudsonbrendon/ha-mvave-tankg) —
  recon BLE do Tank-G
- [jvsobrinho/mvave-blackbox-ble](https://github.com/jvsobrinho/mvave-blackbox-ble) —
  protocolo USB do Blackbox
- Manuais oficiais do Cube Baby e Tank-G

## Licença

[GPL-3.0](./LICENSE) — o protocolo é uma reimplementação própria baseada no
`cuvave-midi` (GPL-3), e o projeto mantém a mesma licença.
