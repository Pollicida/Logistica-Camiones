# 1. Usar una imagen oficial de Node.js en su versión Alpine (muy ligera y segura)
FROM node:20-alpine

# 2. Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# 3. Copiar únicamente los archivos de dependencias primero
# Esto aprovecha el caché de capas de Docker: si tu código cambia pero tus 
# dependencias no, Docker no perderá tiempo reinstalando todo.
COPY package*.json ./

# 4. Instalar las dependencias
# 'npm ci' es ideal para entornos automatizados porque instala las versiones 
# exactas del package-lock.json de forma limpia.
RUN npm ci

# 5. Copiar el resto del código fuente al contenedor
COPY . .

# 6. Compilar TypeScript a JavaScript
RUN npm run build

# 7. Exponer el puerto en el que escucha tu servidor (el docker-compose espera el 3000)
EXPOSE 3000

# 8. (Opcional pero recomendado por seguridad) Usar el usuario 'node' sin privilegios root
USER node

# 9. Comando para iniciar la aplicación (apunta al archivo compilado en dist/)
CMD ["node", "dist/main.js"]