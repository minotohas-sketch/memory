import { useEffect, useState } from "react";
import type { ApiClient, MeResponse } from "./api";
import type { RewardAdStatus } from "./useRewardAd";


declare global {
  interface Window {

    show_11369203?: (
      options?: {
        type?: "pop" | "preload";
        ymid?: string;
        requestVar?: string;
      }
    ) => Promise<void>;

  }
}


const MONETAG_ZONE_ID = "11369203";

const CONFIRM_DELAY_MS = 3000;



let sdkLoaded = false;

let sdkPromise:
  Promise<void> | null = null;




function loadMonetagSdk(){

  if(sdkLoaded){
    return Promise.resolve();
  }


  if(sdkPromise){
    return sdkPromise;
  }



  sdkPromise =
    new Promise(
      (resolve,reject)=>{


        const script =
          document.createElement(
            "script"
          );


        script.src =
          "https://libtl.com/sdk.js";


        script.async = true;


        script.dataset.zone =
          MONETAG_ZONE_ID;


        script.dataset.sdk =
          `show_${MONETAG_ZONE_ID}`;




        script.onload = ()=>{

          sdkLoaded = true;

          resolve();

        };



        script.onerror = ()=>{

          sdkPromise=null;

          reject(
            new Error(
              "monetag_sdk_failed"
            )
          );

        };



        document.head.appendChild(script);

      }
    );



  return sdkPromise;

}





function useMonetagAd(

  adType:
    "pop" |
    "interstitial",

  requestVar:
    "earn_coins" |
    "energy_refill",

  api:ApiClient,

  onCredited:
    (me:MeResponse)=>void

){



  const [status,setStatus] =
    useState<RewardAdStatus>(
      "idle"
    );




  useEffect(()=>{

    loadMonetagSdk()
      .catch(()=>{});


  },[]);






  const watch = async()=>{


    if(
      status==="watching" ||
      status==="confirming"
    ){
      return;
    }



    setStatus("watching");



    try {


      await loadMonetagSdk();



      if(
        !window.show_11369203
      ){

        throw new Error(
          "monetag_unavailable"
        );

      }




      const ymid =
        crypto.randomUUID();




      await window.show_11369203({

        ...(adType==="pop"
          ? {
              type:"pop"
            }
          : {}),


        ymid,


        requestVar

      });



    }
    catch(err){


      console.error(
        "Monetag error",
        err
      );


      setStatus("idle");

      return;

    }





    /*
      Ici uniquement:
      Monetag a fini ny display.
      Ny reward tena avy amin'ny postback.
    */


    setStatus(
      "confirming"
    );



    await new Promise(
      r =>
      setTimeout(
        r,
        CONFIRM_DELAY_MS
      )
    );



    try {


      const me =
        await api.me();



      onCredited(me);



      setStatus(
        "done"
      );



    }
    catch{


      setStatus(
        "error"
      );


    }




    setTimeout(
      ()=>setStatus("idle"),
      2000
    );


  };





  return {
    watch,
    status
  };


}







export function useMonetagEarnCoins(
  api:ApiClient,
  onCredited:
    (me:MeResponse)=>void
){

  return useMonetagAd(
    "interstitial",
    "earn_coins",
    api,
    onCredited
  );

}







export function useMonetagEnergyRefill(
  api:ApiClient,
  onCredited:
    (me:MeResponse)=>void
){

  return useMonetagAd(
    "pop",
    "energy_refill",
    api,
    onCredited
  );

}