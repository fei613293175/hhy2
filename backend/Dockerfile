FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
COPY cmd ./cmd
COPY migrations ./migrations
RUN go mod download \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/hhy-api ./cmd/api \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/hhy-worker ./cmd/worker \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/hhy-migrate ./cmd/migrate
FROM alpine:3.20
RUN adduser -D -H -u 10001 hhy
COPY --from=build /out/hhy-api /usr/local/bin/hhy-api
COPY --from=build /out/hhy-worker /usr/local/bin/hhy-worker
COPY --from=build /out/hhy-migrate /usr/local/bin/hhy-migrate
COPY --from=build /src/migrations /migrations
USER hhy
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/hhy-api"]
