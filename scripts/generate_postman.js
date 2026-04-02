const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, 'services');
const baseUrl = '{{base_url}}'; // Postman variable
const services = fs.readdirSync(servicesDir).filter(f => fs.statSync(path.join(servicesDir, f)).isDirectory());

const collection = {
  info: {
    name: "Mannathan Backend API",
    description: "Postman Collection for Mannathan Backend API",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  item: [],
  variable: [
    {
      key: "base_url",
      value: "http://localhost:8000",
      type: "string"
    },
    {
      key: "token",
      value: "",
      type: "string"
    }
  ]
};

const servicePrefixMap = {
  'auth-service': '/api/auth',
  'shop-service': '/api/shop',
  'catalog-service': '/api/catalog',
  'search-service': '/api/search',
  'review-service': '/api/reviews',
  'notification-service': '/api/notification',
  'chat-service': '/api/chat',
  'media-service': '/api/media',
  'payment-service':'/api/payment'
  // 'account-service': '/api/account',
};

// Some services might have multiple routers, e.g. catalog has products, categories.
// So catalog-service might be mounted at /api/catalog, but how does api-gateway proxy it?
// Let's assume the api-gateway strips or just passes through the path.

for (const service of services) {
  if (service === 'api-gateway') continue;
  
  const routesDir = path.join(servicesDir, service, 'src', 'routes');
  if (!fs.existsSync(routesDir)) continue;

  const folderItem = {
    name: service,
    item: []
  };

  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.routes.js') || f.endsWith('.js'));
  
  for (const file of routeFiles) {
    const filePath = path.join(routesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Look for router.method('path', ...)
    const regex = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    let match;
    
    // Determine prefix from api-gateway routes or file name
    let prefix = servicePrefixMap[service] || `/api/${service.replace('-service', '')}`;

    // If there are multiple prefixes per service based on filename (e.g. catalog-service -> category.routes.js -> /api/catalog/categories)
    // we need to guess or read the service's index.js. 
    // We'll leave it simple: the path in the route file + prefix.

    while ((match = regex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      let routePath = match[2];
      
      // Some API proxy might pass the base URL. e.g. /api/catalog/products.
      // We will look at the filename to guess the subpath if needed, or just append it.
      // Usually, in microservices, the proxy maps /api/catalog to / in the service or similar.
      // Actually, if the api gateway pathRewrite strips prefix, then the service routes define from '/'.
      
      // Let's create the request name
      const reqName = `${method} ${routePath}`;
      
      // Clean up route validation syntax like :id to postman {{id}} or just :id
      let fullPath = `${prefix}${routePath === '/' ? '' : routePath}`.replace(/\/+/g, '/');

      let urlPaths = fullPath.split('/').filter(p => p !== '');

      const requestItem = {
        name: `${file.replace('.routes.js', '')} - ${reqName}`,
        request: {
          method: method,
          header: [
            {
              key: "Authorization",
              value: "Bearer {{token}}",
              type: "text"
            }
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
          options: {
            raw: {
              language: 'json'
            }
          }
        };
      }
      
      folderItem.item.push(requestItem);
    }
  }
  
  if (folderItem.item.length > 0) {
    collection.item.push(folderItem);
  }
}

fs.writeFileSync(path.join(__dirname, 'postman_collection.json'), JSON.stringify(collection, null, 2));
console.log('Postman collection generated successfully at postman_collection.json');
