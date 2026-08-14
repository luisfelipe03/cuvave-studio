# Cuvave Studio

Ver [`cuvave-spec.md`](./cuvave-spec.md) para a especificação completa.

## Estrutura

```
packages/protocol   ← core do protocolo Cuvave/M-VAVE (placeholder até o M1)
packages/profiles    ← perfis de dispositivo (placeholder até o M2)
apps/web              ← app React + Vite + TS (Web MIDI, roda no Chrome/Edge)
```

## Rodar

```sh
npm install
npm run dev     # abre em http://localhost:5173
```

## Build de produção

```sh
npm run build   # gera apps/web/dist
```
