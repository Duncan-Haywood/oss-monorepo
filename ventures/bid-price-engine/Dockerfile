FROM nginx:1.27-alpine
# Static site: pages, the modules they import, and the PWA files. Tests and the Capacitor wrapper stay out of the image.
COPY index.html markup-vs-margin.html calc.mjs closeout.mjs winrate.mjs trades.mjs usage.mjs sw.js manifest.webmanifest robots.txt sitemap.xml LICENSE /usr/share/nginx/html/
COPY icons/ /usr/share/nginx/html/icons/
RUN printf 'types { text/javascript mjs; }\n' > /etc/nginx/conf.d/mjs.conf
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
