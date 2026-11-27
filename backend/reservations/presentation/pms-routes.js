import { body,json } from '../../shared/http.js';

export function pmsRoutes(service,jwt) {
  return async (req,res,path)=>{
    if(!path.startsWith('/pms/')) return false;
    const actor=jwt.identity(req);
    const method=req.method;
    let data,status=200;
    if(method==='GET'&&path==='/pms/payment-settings') data=service.settings();
    else if(method==='PUT'&&path==='/pms/payment-settings') data=service.configurePayment(actor,await body(req));
    else if(method==='GET'&&path==='/pms/dashboard') data=service.dashboard(actor);
    else if(method==='GET'&&path==='/pms/mine') data=service.mine(actor);
    else if(method==='POST'&&path==='/pms/check-in') {data=service.checkIn(actor,await body(req)); status=201;}
    else if(method==='POST'&&path==='/pms/proofs') {data=service.proof(actor,await body(req)); status=201;}
    else if(method==='POST'&&path==='/pms/catalog') {data=service.product(actor,await body(req)); status=201;}
    else {
      const match=/^\/pms\/(stays|proofs|tasks)\/(\d+)(?:\/(charges|payments|check-out|review))?$/.exec(path);
      if(!match) return false;
      const [,entity,raw,action]=match, id=Number(raw);
      if(entity==='stays'&&method==='GET'&&!action) data=service.folio(actor,id);
      else if(entity==='stays'&&method==='POST'&&action==='charges') data=service.charge(actor,id,await body(req));
      else if(entity==='stays'&&method==='POST'&&action==='payments') data=service.settle(actor,id,await body(req));
      else if(entity==='stays'&&method==='POST'&&action==='check-out') data=service.checkOut(actor,id);
      else if(entity==='proofs'&&method==='POST'&&action==='review') data=service.review(actor,id,await body(req));
      else if(entity==='tasks'&&method==='PUT'&&!action) data=service.task(actor,id,await body(req));
      else return false;
    }
    json(res,status,{success:true,data});return true;
  };
}
