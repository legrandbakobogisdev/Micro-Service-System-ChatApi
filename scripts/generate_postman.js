const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '..', 'services');
const baseUrl = '{{base_url}}';
const services = fs.readdirSync(servicesDir).filter(f => fs.statSync(path.join(servicesDir, f)).isDirectory());

const collection = {
  info: {
    name: "ChatApp API",
    description: "Postman Collection for ChatApp Real-Time Messaging API",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  item: [],
  variable: [
    { key: "base_url", value: "http://localhost:8000", type: "string" },
    { key: "token", value: "", type: "string" }
  ]
};

const servicePrefixMap = {
  'auth-service': '/api/auth',
  'notification-service': '/api/notification',
  'chat-service': '/api/chat',
  'media-service': '/api/media',
  'payment-service': '/api/payment',
  'analytics-service': '/api/analytics',
  'subscription-service': '/api/subscription',
  'support-service': '/api/support',
};

for (const service of services) {
  if (service === 'api-gateway') continue;
  
  const routesDir = path.join(servicesDir, service, 'src', 'routes');
  if (!fs.existsSync(routesDir)) continue;

  const folderItem = { name: service, item: [] };

  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.routes.js') || f.endsWith('.js'));
  
  for (const file of routeFiles) {
    const filePath = path.join(routesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const regex = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    let match;
    
    let prefix = servicePrefixMap[service] || `/api/${service.replace('-service', '')}`;

    while ((match = regex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      let routePath = match[2];
      
      const reqName = `${method} ${routePath}`;
      let fullPath = `${prefix}${routePath === '/' ? '' : routePath}`.replace(/\/+/g, '/');
      let urlPaths = fullPath.split('/').filter(p => p !== '');

      const requestItem = {
        name: `${file.replace('.routes.js', '')} - ${reqName}`,
        request: {
          method: method,
          header: [
            { key: "Authorization", value: "Bearer {{token}}", type: "text" },
            { key: "Content-Type", value: "application/json", type: "text" }
          ],
          url: {
            raw: `${baseUrl}${fullPath}`,
            host: ["{{base_url}}"],
            path: urlPaths,
            variable: urlPaths.filter(p => p.startsWith(':')).map(p => ({
              key: p.substring(1),
              value: ""
            }))
          }
        },
        response: []
      };
      
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        requestItem.request.body = {
          mode: 'raw',
          raw: '{\n  \n}',
          options: { raw: { language: 'json' } }
        };
      }
      
      folderItem.item.push(requestItem);
    }
  }
  
  if (folderItem.item.length > 0) {
    collection.item.push(folderItem);
  }
}

const outputPath = path.join(__dirname, '../docs', 'postman_collection.json');
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
console.log(`✅ Postman collection generated at postman_collection.json (${collection.item.reduce((s, f) => s + f.item.length, 0)} requests)`);
