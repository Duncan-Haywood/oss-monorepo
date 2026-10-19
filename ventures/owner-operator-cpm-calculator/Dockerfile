FROM nginx:1.27-alpine
# Static site: pages and the modules they import. Tests stay out of the image.
COPY deadhead-miles.html does-detention-pay-cover-the-wait.html index.html vs-atbs.html vs-dat-rateview.html vs-dividing-your-bills-by-your-miles.html calc.mjs share.mjs usage.mjs robots.txt sitemap.xml LICENSE /usr/share/nginx/html/
RUN printf 'types { text/javascript mjs; }\n' > /etc/nginx/conf.d/mjs.conf
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
