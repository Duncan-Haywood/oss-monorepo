FROM nginx:1.27-alpine
# Static site: the page, its modules and the guides. Tests stay out of the image.
COPY index.html calc.mjs food-library.mjs usage.mjs robots.txt sitemap.xml *-*.html /usr/share/nginx/html/
RUN printf 'types { text/javascript mjs; }\n' > /etc/nginx/conf.d/mjs.conf
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
