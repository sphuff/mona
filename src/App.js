import React, { Component } from 'react'
import mona from './assets/mona-lisa.png'
import eyes from './assets/eyes.png'
import wink from './assets/wink.png'
import wordBalloon from './assets/wordballoon.png'
import './App.css';
import * as posenet from '@tensorflow-models/posenet'
const imageScaleFactor = 0.5
const outputStride = 16
const flipHorizontal = true
const shouldDraw = false
const showDistanceInteractions = false
let guiState = {
  net: null,
  multiPose: {
    maxPoseDetections: 5,
    minPoseConfidence: 0.15,
    minPartConfidence: 0.1,
    nmsRadius: 30.0,
  }
}

class App extends Component {
  constructor() {
    super()
    this.eyePos = 0
    this.state = {
      isLoaded: false, 
      isCapturing: false,
    }
  }
  componentDidMount() {
    if (!showDistanceInteractions) {
      this.hideWink()
      this.hideWordBalloon()
    }
    posenet.load()
      .then(net => {
        console.log('LOADED POSENET');
        
        guiState.net = net
        this.setState({
          isLoaded: true,
        })
      })
    navigator.mediaDevices.getUserMedia({ video: true})
      .then(mediaStream => {
        console.log('MEDIA STREAM');
        
        var video = document.querySelector('video')
        video.srcObject = mediaStream;
        video.onloadedmetadata = () => {
          video.play()
        }
      })
  }
  pose() {
    console.log('POSE');
    this.setState({
      isCapturing: true
    })
    const video = document.querySelector('video')
    const canvas = document.getElementById('output')
    const mona = document.getElementById('mona')
    const button = document.getElementById('pose-btn')
    const eyes = document.getElementById('eyes')
    const ctx = canvas.getContext('2d')
    const videoWidth = video.getBoundingClientRect().width
    const videoHeight = video.getBoundingClientRect().height
    const canvasWidth = mona.clientWidth
    const canvasHeight = mona.clientHeight
    // const canvasWidth = videoWidth
    // const canvasHeight = videoHeight
    canvas.height = canvasHeight
    canvas.width = canvasWidth
    const radius = 10
    const self = this
    let people = []
    
    async function poseDetectionFrame() {
      let poses = []
      
      poses = await guiState.net.estimateMultiplePoses(video, imageScaleFactor, flipHorizontal, outputStride, 
        guiState.multiPose.maxPoseDetections)
      const minPoseConfidence = guiState.multiPose.minPoseConfidence
      const minPartConfidence = guiState.multiPose.minPartConfidence

      ctx.clearRect(0, 0, canvasWidth, canvasHeight)
      ctx.save()
      // ctx.scale(-1, 1)
      // ctx.translate(-canvasWidth, 0)
      ctx.drawImage(mona, 0, 0, canvasWidth, canvasHeight)
      ctx.restore()
      
      const colors = ['cyan', 'green', 'blue', 'orange', 'purple']
      const closestPose = poses.reduce((acc, pose, idx) => {
        const { keypoints, score } = pose
        let color = colors[idx]
        keypoints.forEach(point => {
          if (point.score < minPartConfidence)
            return
          const { x, y } = point.position
          let partColor
          if (point.part === 'leftWrist' || point.part === 'rightWrist') {
            partColor = 'cyan'
          } else if (point.part === 'leftShoulder' || point.part === 'rightShoulder') {
            partColor = 'orange'
          } else {
            partColor = color
          }
          
          shouldDraw && self.drawCircle(ctx, x, y, radius, partColor)
        })
        const min = (acc, currentVal) => Math.min(acc, currentVal)
        const max = (acc, currentVal) => Math.max(acc, currentVal)
        const minX = keypoints.map(point => point.position.x).reduce(min)
        const minY = keypoints.map(point => point.position.y).reduce(min)
        const maxX = keypoints.map(point => point.position.x).reduce(max)
        const maxY = keypoints.map(point => point.position.y).reduce(max)
        
        const person = {minX, minY, maxX, maxY, color, keypoints}
        const personsLastState = self.alreadySeenPerson(person, people)
        if (personsLastState) {
          color = personsLastState.color
          personsLastState.minX = minX
          personsLastState.minY = minY
          personsLastState.maxX = maxX
          personsLastState.maxY = maxY
          personsLastState.keypoints = keypoints
        } else {
          people.push(person)
        }
        const width = Math.abs(minX - maxX)
        const height = Math.abs(minY - maxY)
        const {position: {x, y}} = person.keypoints.find(point => point.part === 'leftEye' || point.part === 'rightEye')
        if ((width * height) > (acc.width * acc.height)) {
          return {width, height, x, y, keypoints}
        } else {
          return acc
        }
        // self.drawRect(ctx, minX, minY, (maxX - minX), (maxY - minY), color)
      }, {width: 0, height: 0, keypoints: []})
      const {x, y, keypoints} = closestPose
      const leftShoulder = keypoints.find(point => point.part === 'leftShoulder' && point.score > 0.5)
      const rightShoulder = keypoints.find(point => point.part === 'rightShoulder' && point.score > 0.5)
      if (leftShoulder && rightShoulder) {
        const  {position: {x: leftShoulderX, y: leftShoulderY}} = leftShoulder
        const  {position: {x: rightShoulderX, y: rightShoulderY}} = rightShoulder
        const shoulderDistX = Math.abs(leftShoulderX - rightShoulderX)
        const shoulderDistY = Math.abs(leftShoulderY - rightShoulderY)
        
        if (showDistanceInteractions) {
          if (shoulderDistX > 150) {
            // person is close
            self.showWordBalloon()
            self.hideWink()
          } else if (shoulderDistX > 125) {
            self.wink()
            self.hideWordBalloon()
          } else {
            self.hideWink()
            self.hideWordBalloon()
          }
        }
      }
      shouldDraw && self.drawCircle(ctx, x, y, radius, 'red')
      self.moveEye(x, y, videoWidth, eyes)
      requestAnimationFrame(poseDetectionFrame)
    }
    poseDetectionFrame()
    video.style.display = 'none'
    button.style.display = 'none'
    eyes.style.display = 'block'
    eyes.classList.add('move')
  }
  
  moveEye(x, y, videoWidth, eyeDom) {
    // restrict eye pos to width of video, get percentage, and use that to calc percentage of mona eye movement
    const newEyePosX = Math.abs(Math.round((x / videoWidth) * 25))
    if (newEyePosX !== this.eyePos) {
      this.eyePos = newEyePosX
    }
    eyeDom.style.marginLeft = `${this.eyePos}px`
  }

  distanceIsWithinTolerance(val1, val2) {
    const tolerance = 100
    return Math.abs(val1 - val2) < tolerance
  }

  checkJoints(person1, person2) {
    let { keypoints: keypoints1 } = person1
    let { keypoints: keypoints2 } = person2
    keypoints1 = keypoints1.filter(point => point.score > 0.5)
    keypoints2 = keypoints2.filter(point => point.score > 0.5)
    return keypoints1.reduce((acc, currentVal) => {
      // if points being compared are above a certain confidence level 
      // for both, then check the distance
      let point2 = keypoints2.find((val) => val.part === currentVal.part)
      if (point2) {
        return acc 
          && this.distanceIsWithinTolerance(currentVal.position.x, point2.position.x)
          && this.distanceIsWithinTolerance(currentVal.position.y, point2.position.y)
      } else {
        return acc
      }
    }, true)
  }

  // returns the person's last state given a pose, or undefined if 
  // the person has not been seen before
  alreadySeenPerson(person, peopleAlreadySeen) {
    return peopleAlreadySeen.find(personAlreadySeen => {
      return this.checkJoints(person, personAlreadySeen)
    })
  }

  drawCircle(ctx, x, y, radius, color) {
    ctx.beginPath()
    ctx.fillStyle = color
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false)
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = '#003300'
    ctx.stroke()
  }
  drawRect(ctx, x, y, width, height, color) {
    ctx.beginPath()
    ctx.fillStyle = color
    ctx.rect(x, y, width, height)
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = '#003300'
    ctx.stroke()
  }
  wink() {
    const wink = document.getElementById('wink')
    wink.style.display = 'block'
  }
  
  hideWink() {
    const wink = document.getElementById('wink')
    wink.style.display = 'none'
  }
  showWordBalloon() {
    const wordBalloon = document.getElementById('word-balloon')
    wordBalloon.style.display = 'block'
  }
  hideWordBalloon() {
    const wordBalloon = document.getElementById('word-balloon')
    wordBalloon.style.display = 'none'
  }


  render() {
    return (
      <div className="App">
        <p style={{position: 'absolute', top: '0px', right: '20px', color: 'white', zIndex: 100}}>1.7</p>
        <video height="450px" width="600px"/>
        <button id='pose-btn' onClick={this.pose.bind(this)} disabled={!this.state.isLoaded || this.state.isCapturing}>Pose</button>
        <canvas id='output'/>
        <img id="eyes" src={eyes}/>
        <img id="wink" src={wink}/>
        <img id="mona" src={mona}/>
        <img id="word-balloon" src={wordBalloon}/>
      </div>
    );
  }
}

export default App;
