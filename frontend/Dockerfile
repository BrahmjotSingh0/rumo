FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_TURN_URL
ARG VITE_TURN_USERNAME
ARG VITE_TURN_CREDENTIAL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_TURN_URL=$VITE_TURN_URL
ENV VITE_TURN_USERNAME=$VITE_TURN_USERNAME
ENV VITE_TURN_CREDENTIAL=$VITE_TURN_CREDENTIAL

RUN npm run build

# The frontend's Content-Security-Policy (see nginx.conf) needs to allow
# whatever backend/socket origin this deployment was actually built with -
# that's runtime-configurable per self-hosted instance, so a hardcoded
# policy would break WebRTC/websocket connections for anyone whose backend
# isn't on this same origin. Computed here (Node is only available in this
# build stage, not the final nginx image) as the ordinary https:// origin
# plus its ws(s):// equivalent, since a connect-src source is scheme-
# sensitive and Socket.IO upgrades to a websocket. VITE_TURN_URL is
# deliberately not part of this: turn:/stun: aren't http(s) URLs (new URL()
# on one doesn't fail, it just silently returns a useless "null" origin),
# and nginx.conf already allows those two schemes for any host.
RUN node -e "\
  const urls = [process.env.VITE_API_URL, process.env.VITE_SOCKET_URL].filter(Boolean); \
  const origins = new Set(); \
  for (const raw of urls) { \
    try { \
      const parsed = new URL(raw); \
      origins.add(parsed.origin); \
      origins.add(parsed.origin.replace(/^http/, 'ws')); \
    } catch { /* not a valid http(s) URL - skip */ } \
  } \
  require('fs').writeFileSync('/connect-src-extra.txt', Array.from(origins).join(' ')); \
"

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /connect-src-extra.txt /tmp/connect-src-extra.txt
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN CONNECT_SRC_EXTRA="$(cat /tmp/connect-src-extra.txt)" && \
    sed -i "s|__RUMO_CONNECT_SRC_EXTRA__|${CONNECT_SRC_EXTRA}|" /etc/nginx/conf.d/default.conf && \
    rm /tmp/connect-src-extra.txt

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
