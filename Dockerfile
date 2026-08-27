FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_PORTFOLIO_DEMO=false
ENV NEXT_PUBLIC_PORTFOLIO_DEMO=${NEXT_PUBLIC_PORTFOLIO_DEMO}
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV SUPER_FAMILY_DATA_DIR=/app/data

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN mkdir -p /app/data

EXPOSE 3035

CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3035"]
