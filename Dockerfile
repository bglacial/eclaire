FROM node:22-alpine AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts capacitor.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS routing
WORKDIR /build
COPY server/pom.xml ./pom.xml
COPY server/src ./src
RUN mvn -q package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=web /build/dist ./dist
COPY --from=routing /build/target/eclaire-routing.jar ./service.jar
ENV JAVA_TOOL_OPTIONS=-Xmx12g ECLAIRE_HOST=0.0.0.0 ECLAIRE_OSM_FILE=/data/france-latest.osm.pbf ECLAIRE_GRAPH_DIR=/data/france-graph
EXPOSE 8787
ENTRYPOINT ["java", "-jar", "service.jar"]
