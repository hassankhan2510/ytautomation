# Campus Ambassador reel — first 8 lines, written in CUE (the free LLM will write this in Phase 2)
style cohort-zero
aspect 9:16 1:1 16:9

scene hook mood=tense
  say "Campus mein sab kuch hota hai, lekin kya aap ke campus par founders aur leaders ban rahe hain?"
  kicker "Cohort Zero"
  title "Founders aur leaders ban rahe hain?" emphasis="founders"
  shot push-in

scene you mood=serious
  say "Agar nahi, to shayad yeh kaam aap ka hai."
  title "Yeh kaam aap ka hai" emphasis="aap"
  shot close-up

scene open mood=hype
  say "Cohort Zero apna Campus Ambassador Program open kar raha hai, aur sach kahen"
  kicker "Now open"
  title "Campus Ambassador Program" emphasis="Ambassador"

scene big mood=hype
  say "to yeh is saal ka sab se bada opportunity ho sakta hai."
  title "Sab se bada opportunity" emphasis="bada"
  shot push-in

scene eco mood=serious
  say "Cohort Zero ek global founder ecosystem hai,"
  kicker "Cohort Zero"
  title "Global founder ecosystem" emphasis="global"

scene mission mood=hype
  say "jis ka mission hai logon ko zero se one tak le jana."
  stat "1" label="zero se one tak" at="one"

scene every mood=warm
  say "Aur ab humein har university mein aise log chahiyein jo yeh movement apne campus tak le kar aayen."
  title "Har university mein" emphasis="har"
  body "Log jo yeh movement apne campus tak laayen"

scene role mood=serious
  say "Bator Campus Ambassador, aap apni university mein Cohort Zero ko represent karenge,"
  kicker "Your role"
  list "Represent|Connect|Lead"
