FROM nginx:1.27-alpine
# Static site: every page, the modules they import and the guides. Tests stay out of the image.
COPY index.html offer.html tax.html calc.mjs offer.mjs tax.mjs share.mjs usage.mjs log.mjs robots.txt sitemap.xml LICENSE vs-*.html how-much-*.html /usr/share/nginx/html/
RUN printf 'types { text/javascript mjs; }\n' > /etc/nginx/conf.d/mjs.conf
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
