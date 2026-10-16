FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build
ARG TARGETOS TARGETARCH VERSION=dev
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o /stackatlas .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /stackatlas /stackatlas
EXPOSE 8080
ENTRYPOINT ["/stackatlas"]
