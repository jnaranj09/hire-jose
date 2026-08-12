FROM haproxy:3.0-alpine

USER root
RUN apk add --no-cache gettext

COPY haproxy.cfg.template /usr/local/etc/haproxy/haproxy.cfg.template
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV LB_PORT=8080
ENV LB_STATS_PORT=5000
ENV CHAT_API_PORT=3000
ENV LB_SITE_RATE=300
ENV LB_API_RATE=30
ENV LB_API_ERR_RATE=20

USER haproxy
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
