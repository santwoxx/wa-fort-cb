# Manual de Implantação (Deploy) - WA Fort Billing

Este guia orienta o processo de deploy da aplicação dividida em **Frontend no Vercel** e **Backend no Render**, agora estruturada de forma modular.

---

## 🚀 1. Frontend no Vercel

O frontend é uma SPA (Single Page Application) construída com React, TypeScript e Vite, localizada na pasta `/frontend`.

### Passo a Passo:
1. Acesse o painel da [Vercel](https://vercel.com/) e clique em **Add New > Project**.
2. Conecte o repositório do Git.
3. Configure os parâmetros do projeto:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend` *(Clique em Edit e selecione a pasta `frontend`)*.
   - **Build Command**: `npm run build` (ou `vite build`).
   - **Output Directory**: `dist` (padrão do Vite).
4. Adicione as seguintes **Environment Variables** (Variáveis de Ambiente):
   - `VITE_API_URL`: Insira a URL do seu backend no Render (ex: `https://wa-fort-backend.onrender.com`).
   *Nota: O prefixo `VITE_` é obrigatório para que o Vite exponha a variável ao código do cliente em tempo de build.*
5. Clique em **Deploy**.

---

## 🖥️ 2. Backend no Render

O backend é um servidor Express executando em Node.js, localizado na pasta `/backend`.

### Passo a Passo:
1. Acesse o painel do [Render](https://render.com/) e clique em **New > Web Service**.
2. Conecte o repositório do Git.
3. Configure os parâmetros do serviço:
   - **Name**: `wa-fort-backend` (ou o nome de sua escolha).
   - **Environment**: `Node`.
   - **Region**: Selecione a mais próxima (ex: Ohio/Frankfurt/Singapore/Oregon).
   - **Branch**: `main` (ou a branch principal de produção).
   - **Root Directory**: `backend` *(Em Advanced Settings, defina o diretório raiz como `backend`)*.
   - **Build Command**: `npm run build` *(Gera dist/server.cjs via esbuild)*.
   - **Start Command**: `npm run start` *(Executa node dist/server.cjs)*.
4. Adicione as seguintes **Environment Variables** (Variáveis de Ambiente) em Render:
   - `GEMINI_API_KEY`: A sua chave de API do Gemini para processamento de linguagem natural e criação de mensagens customizadas.
   - `FIREBASE_SERVICE_ACCOUNT`: (Opcional) A credencial JSON de conta de serviço do Firebase para autenticar e gerenciar permissões no banco do Firestore. Se não estiver configurado, o servidor usará um modo de simulação/fallback offline seguro.
   - `NODE_ENV`: `production`.
5. Clique em **Create Web Service**.

---

## 🔄 Fluxo de Comunicação & CORS
* Para evitar erros de CORS (Cross-Origin Resource Sharing), o backend Express já conta com cabeçalhos CORS liberados (`Access-Control-Allow-Origin: *`).
* As requisições feitas pelo cliente React lerão a URL configurada em `VITE_API_URL` do Vercel e redirecionarão as chamadas de API diretamente para os endpoints do Render de forma segura.
