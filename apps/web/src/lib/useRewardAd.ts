import { useState } from "react";
import { useAdsgram } from "./useAdsgram";
import type { ApiClient, MeResponse } from "./api";


export type RewardAdStatus =
  | "idle"
  | "watching"
  | "confirming"
  | "done"
  | "unavailable"
  | "error";


const CONFIRM_DELAY_MS = 2500;



export function useRewardAd(
  blockId: string | undefined,
  api: ApiClient,
  onCredited: (me: MeResponse) => void
) {

  const { show } = useAdsgram(blockId);

  const [status,setStatus] =
    useState<RewardAdStatus>("idle");


  const watch = async () => {


    if (!blockId) {

      setStatus("unavailable");

      setTimeout(
        ()=>setStatus("idle"),
        2000
      );

      return;
    }



    /**
     * Anti double click
     */
    if (
      status === "watching" ||
      status === "confirming"
    ) {
      return;
    }



    setStatus("watching");



    try {

      await show();


    } catch {


      /**
       * Pub fermée,
       * pas disponible,
       * skip utilisateur
       */
      setStatus("idle");

      return;

    }



    /**
     * Adsgram postback -> backend
     * puis on relit le profil
     */
    setStatus("confirming");



    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          CONFIRM_DELAY_MS
        )
    );



    try {


      const me =
        await api.me();


      onCredited(me);


      setStatus("done");



    } catch {


      setStatus("error");


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
