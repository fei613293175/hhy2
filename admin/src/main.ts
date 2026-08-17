import { createApp, nextTick } from 'vue';
import App from './App.vue';

createApp(App).mount('#vue-root');

void nextTick(() => {
  const script = document.createElement('script');
  script.src = '/app.js';
  script.defer = true;
  document.body.append(script);
});
