(function(){
  "use strict";

  var heroes = [
    "/assets/sync-heroes/sync-pepe-default.png",
    "/assets/sync-heroes/sync-pepe-phone.png",
    "/assets/sync-heroes/sync-pepe-glasses.png",
    "/assets/sync-heroes/sync-pepe-hood.png",
    "/assets/sync-heroes/sync-pepe-coffee.png",
    "/assets/sync-heroes/sync-pepe-point.png"
  ];

  function pickHero(){
    var img = document.querySelector(".sync-pepe-art img");
    if(!img) return;

    var last = "";
    try{ last = localStorage.getItem("syncHeroLast") || ""; }catch(e){}

    var pool = heroes.filter(function(src){ return src !== last; });
    if(!pool.length) pool = heroes.slice();

    var chosen = pool[Math.floor(Math.random() * pool.length)];

    var pre = new Image();
    pre.onload = function(){
      img.src = chosen + "?v=6";
      try{ localStorage.setItem("syncHeroLast", chosen); }catch(e){}
    };
    pre.onerror = function(){
      img.src = "/assets/sync-heroes/sync-pepe-default.png?v=6";
    };
    pre.src = chosen + "?v=6";
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", pickHero, {once:true});
  }else{
    pickHero();
  }
})();