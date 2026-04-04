# GemCode

GemCode è una piattaforma AI dual-stack che combina una **chat web basata su Gemini** con un **agente autonomo Android** con inferenza LLM on-device.

## Componenti

| Componente | Stack | Descrizione |
|---|---|---|
| **Web UI** | React 19 + TypeScript + Vite | Chat interface in stile Gemini, streaming, impostazioni |
| **Android Agent** | Kotlin + Jetpack Compose | Agente ReAct con Gemma 4 on-device via LiteRT-LM |

## Quick Start — Web

```bash
npm install
cp .env.example .env
# Imposta GEMINI_API_KEY nel file .env
npm run dev
```

## Quick Start — Android

```bash
./gradlew assembleDebug
./gradlew installDebug
```

Requisiti runtime: Android 10+ (API 29), ≥ 4 GB RAM, Shizuku (opzionale).

## Documentazione

Vedi [`docs/PRODUCT.md`](docs/PRODUCT.md) per la documentazione tecnica completa.
