# microduck pet

Um microduck em pixel art passeando pela área de trabalho do Windows. Baseado no
[Microduck](https://github.com/pollen-robotics/microduck) da Pollen Robotics: cabeça de casco
com o olho de câmera, bico que abre, pescoço de servos, pernas com as placas no joelho e os
pés coloridos. Tem as quatro cores dos de verdade (creme, ciano, grafite e lilás).

## Rodar

```
npm install
npm start
```

## O que ele faz

- anda pela barra de tarefas, pulando por cima dos ícones ou subindo neles
- vai e volta entre os monitores
- sobe nas janelas abertas (escalando a lateral) e anda em cima delas; se a janela mexe ele vai
  junto, se ela fecha ou minimiza ele cai
- pula de ícone em ícone da área de trabalho
- widgets do Rainmeter (tipo o player em cima da barra) viram obstáculo: ele sobe em cima e desce do outro lado
- quando tem vídeo tocando ele acha a janela do vídeo (aba ativa do navegador, picture-in-picture
  ou player), vai pro outro monitor (na beirada do lado do vídeo, pra não atrapalhar; com um monitor
  só fica no cantinho), senta virado pro vídeo com um balde de pipoca e fica comendo enquanto assiste
  junto. pega até site que não avisa o windows, pelo som que o navegador/player tá fazendo
- quando tem música (Spotify, YouTube Music, aba escondida tocando…) ele bota um fone de ouvido e
  continua fazendo as coisas dele, só dançando mais vezes
- se você tá jogando (tela cheia, ou jogo fazendo som numa janela grande) ou vendo vídeo num monitor,
  ele vai pro outro (andando ou de portal) e não volta enquanto a tela tiver ocupada
- de vez em quando abre um portal verde, entra e sai em outro lugar (outro monitor, em cima de
  janela, num ícone)
- às vezes monta umas coisas e fica um tempo: trabalhar no notebook, praia de óculos escuros, rede,
  cavalinho e skate (pulam pra cima dos ícones da barra e descem no fim, skate ainda dá ollie), violão, ler um livro, pintar um quadro, pescar, bolhas de sabão,
  regar uma plantinha até dar flor, malhar e tomar sorvete
- de vez em quando dança, dá mortal ou gira
- vira herói de vez em quando (fantasia em versão pato): Naruto (clones das sombras e rasengan),
  Flash (corre a jato pela tela), Homem de Ferro (voa e dispara o raio), Homem-Aranha (pendurado na
  teia), Batman (batarangue e bomba de fumaça), Superman (voa de capa), Hulk (cresce e esmaga o chão),
  Thor (martelo e raios) e Capitão América (joga o escudo)
- não faz som nenhum
- pisca, senta, solta um **QUACK!**
- **clique**: pula e faz quack · **duplo clique**: mortal
- **arraste**: fica pendurado; solte e ele cai, quica e levanta (dá pra arremessar)
- quase não dorme: só tira um cochilo curtinho depois de muito tempo largado (ou pela bandeja). um clique acorda
- ícone na bandeja: Quack, Dançar, Mortal, Portal, Heróis, Fazer (todas as cenas), Dormir, Acordar, Cor, Sair
- clique numa cena: ele dá quack sem largar o que tá fazendo

As partes transparentes da janela deixam o clique passar.

## Arquivos

- `main.js`: janela, bandeja e o "mapa" (chão de cada monitor, topo das janelas, ícones)
- `wins.js`: lê as janelas abertas e a posição dos ícones da área de trabalho (win32)
- `shell.ps1`: lê os botões da barra de tarefas (ui automation), o que tá tocando (app e título) e quem tá fazendo som
- `audio.cs`: medidor de som de cada programa (core audio), usado pelo shell.ps1
- `renderer.js`: comportamento, física e desenho
- `sprites.js`: os sprites 32x40, gerados por formas simples + contorno automático
