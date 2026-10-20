FROM nginx:1.27-alpine
# Static site: pages and the modules they import. Tests stay out of the image.
COPY compare-multiple-offers.html index.html offer-comparison.html transfer-tax-by-state.html vs-homelights-net-proceeds-calculator.html vs-title-company-net-sheet.html vs-zillows-home-sale-calculator.html calc.mjs share.mjs transfer-tax.mjs usage.mjs robots.txt sitemap.xml LICENSE /usr/share/nginx/html/
RUN printf 'types { text/javascript mjs; }\n' > /etc/nginx/conf.d/mjs.conf
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
