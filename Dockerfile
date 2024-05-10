FROM denoland/deno:1.43.2
EXPOSE 8000
WORKDIR /app
USER deno
COPY deno.json .
COPY deps.ts .
COPY deno.lock .
RUN deno cache deps.ts
COPY . .
RUN deno cache main.ts
RUN mkdir -p /var/tmp/log
CMD ["run", "--allow-all", "main.ts"]
