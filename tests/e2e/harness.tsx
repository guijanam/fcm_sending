// Test-only entry: not referenced by index.html or included in production build.
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import type { AdminApi } from '../../src/api';
import '../../src/style.css';
const api: AdminApi = {
 subscribe:cb=>{cb({uid:'test-only',email:'test@example.invalid'});return()=>{};},
 login:async()=>{},logout:async()=>{},
 status:async()=>({topic:'documents',projectId:'mydia-29ac2',email:'test@example.invalid'}),
 list:async()=>({items:[]}),
 send:async input=>({requestId:input.requestId,status:'validated'}),
};
createRoot(document.getElementById('root')!).render(<App api={api}/>);
