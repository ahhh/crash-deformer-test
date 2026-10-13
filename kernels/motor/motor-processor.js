
/*
 * Copyright (c) 2021-2022 Antonio-R1
 * License: https://github.com/Antonio-R1/engine-sound-generator/blob/main/LICENSE | MIT
 * Modified for crash-deformer-test: no per-block allocation, lazy init, silent fast path.
 */

var SoundGeneratorWasm = Module;

class AllocatedArray {
   constructor (ptr = null, length = 0) {
      this.ptr = ptr;
      this.length = length;
   }
}

class EngineSoundGenerator extends AudioWorkletProcessor {

   constructor (options) {
      super ();

      this.throttleArray = new AllocatedArray();
      this.rpmArray = new AllocatedArray();

      this.channelIntakeArray = new AllocatedArray();
      this.channelEngineBlockVibrationsArray = new AllocatedArray();
      this.channelOutletArray = new AllocatedArray();

      // processorOptions contains the values passed to updateParameters.
      // The lengths of the waveguides are specified in samples.
      // The generator is built in process(): embind registers the class only after the async wasm init.
      this.processorOptions = options.processorOptions;
      this.pendingMessage = null;
      this.mufflerElementsLengthPtr = 0;
      this.soundGenerator = null;

      this.port.onmessage = (event) => {
         if (this.soundGenerator === null) {
            this.pendingMessage = event.data;
         } else {
            this.applyMessage (event.data);
         }
      };
   }

   construct () {
      let processorOptions = this.processorOptions;

      this.mufflerElementsLengthPtr = SoundGeneratorWasm._malloc(processorOptions.mufflerElementsLength.length*4);
      SoundGeneratorWasm.HEAPU32.set(processorOptions.mufflerElementsLength, this.mufflerElementsLengthPtr/4);

      this.soundGenerator = new SoundGeneratorWasm.EngineSoundGenerator (sampleRate,
                        processorOptions.cylinders,

                        processorOptions.intakeWaveguideLength, processorOptions.exhaustWaveguideLength,
                        processorOptions.extractorWaveguideLength,

                        processorOptions.intakeOpenReflectionFactor,
                        processorOptions.intakeClosedReflectionFactor,

                        processorOptions.exhaustOpenReflectionFactor,
                        processorOptions.exhaustClosedReflectionFactor,
                        processorOptions.ignitionTime,

                        processorOptions.straightPipeWaveguideLength,
                        processorOptions.straightPipeReflectionFactor,

                        this.mufflerElementsLengthPtr, processorOptions.mufflerElementsLength.length, processorOptions.action,

                        processorOptions.outletWaveguideLength, processorOptions.outletReflectionFactor);

      if (this.pendingMessage !== null) {
         this.applyMessage (this.pendingMessage);
         this.pendingMessage = null;
      }
   }

   applyMessage (parameters) {
      this.updateParameters (parameters["cylinder_count"],
                  parameters["intake_waveguide_length"], parameters["exhaust_waveguide_length"],
                  parameters["extractor_waveguide_length"],

                  parameters["intake_open_reflection_factor"], parameters["intake_closed_reflection_factor"],

                  parameters["exhaust_open_reflection_factor"], parameters["exhaust_closed_reflection_factor"], parameters["ignition_time"],

                  parameters["straight_pipe_waveguide_length"], parameters["straight_pipe_reflection_factor"],

                  parameters["muffler_elements_length"], parameters["action"],

                  parameters["outlet_waveguide_length"], parameters["outlet_reflection_factor"]);
   }

   updateParameters (cylinderCount,

                     intakeWaveguideLength, exhaustWaveguideLength,
                     extractorWaveguideLength,

                     intakeOpenReflectionFactor, intakeClosedReflectionFactor,

                     exhaustOpenReflectionFactor, exhaustClosedReflectionFactor, ignitionTime,

                     straightPipeWaveguideLength, straightPipeReflectionFactor,

                     mufflerElementsLength, action,

                     outletWaveguideLength, outletReflectionFactor) {
      if (!mufflerElementsLength) {
         mufflerElementsLength = [10, 15, 20, 25];
      }
      SoundGeneratorWasm._free(this.mufflerElementsLengthPtr);
      this.mufflerElementsLengthPtr = SoundGeneratorWasm._malloc(mufflerElementsLength.length*4);
      SoundGeneratorWasm.HEAPU32.set(mufflerElementsLength, this.mufflerElementsLengthPtr/4);

      this.soundGenerator.updateParameters (cylinderCount,

                      intakeWaveguideLength, exhaustWaveguideLength,
                      extractorWaveguideLength,

                      intakeOpenReflectionFactor, intakeClosedReflectionFactor,

                      exhaustOpenReflectionFactor, exhaustClosedReflectionFactor, ignitionTime,

                      straightPipeWaveguideLength, straightPipeReflectionFactor,

                      this.mufflerElementsLengthPtr, mufflerElementsLength.length, action,

                      outletWaveguideLength, outletReflectionFactor);
   }

   static get parameterDescriptors () {
      return [{
         name: 'throttle',
         defaultValue: 0.0,
         minValue: 0.0,
         maxValue: 1.0,
         automationRate: 'a-rate'
       }, {
         name: 'rpm',
         defaultValue: 0.0,
         minValue: 0.0,
         automationRate: 'a-rate'
       }];
   }

   allocateArray (allocatedArray, typedArray) {
      if (allocatedArray.length<typedArray.length) {
         if (allocatedArray.ptr) {
            SoundGeneratorWasm._free(allocatedArray.ptr);
         }
         allocatedArray.ptr = SoundGeneratorWasm._malloc(typedArray.length*typedArray.BYTES_PER_ELEMENT);
         allocatedArray.length = typedArray.length;
      }
   }

   setArray (allocatedArray, typedArray) {
      this.allocateArray (allocatedArray, typedArray);
      SoundGeneratorWasm.HEAPF32.set (typedArray, allocatedArray.ptr/SoundGeneratorWasm.HEAPF32.BYTES_PER_ELEMENT);
   }

   setChannelOutput (channel, allocatedArray) {
      // HEAPF32 is re-read here: a memory growth swaps the view. subarray shares memory, so nothing is allocated but the view.
      let heap = SoundGeneratorWasm.HEAPF32;
      let start = allocatedArray.ptr/heap.BYTES_PER_ELEMENT;
      channel.set(heap.subarray(start, start+allocatedArray.length));
   }

   process (inputList, outputList, parameters) {
      let channelIntake = outputList[0][0];
      let channelEngineBlockVibrations = outputList[1][0];
      let channelOutlet = outputList[2][0];

      if (typeof SoundGeneratorWasm.EngineSoundGenerator !== "function") {
         channelIntake.fill(0);
         channelEngineBlockVibrations.fill(0);
         channelOutlet.fill(0);
         return true;
      }
      if (this.soundGenerator === null) {
         this.construct ();
      }

      let rpm = parameters["rpm"];
      if (rpm[0] < 1 && rpm[rpm.length-1] < 1) {
         channelIntake.fill(0);
         channelEngineBlockVibrations.fill(0);
         channelOutlet.fill(0);
         return true;
      }

      this.setArray (this.throttleArray, parameters["throttle"]);
      this.setArray (this.rpmArray, rpm);
      this.allocateArray (this.channelIntakeArray, channelIntake);
      this.allocateArray (this.channelEngineBlockVibrationsArray, channelEngineBlockVibrations);
      this.allocateArray (this.channelOutletArray, channelOutlet);

      this.soundGenerator.generateSound (currentFrame, sampleRate,
                   this.rpmArray.ptr, rpm.length,
                   this.throttleArray.ptr, parameters["throttle"].length,
                   this.channelIntakeArray.ptr, this.channelIntakeArray.length,
                   this.channelEngineBlockVibrationsArray.ptr, this.channelEngineBlockVibrationsArray.length,
                   this.channelOutletArray.ptr, this.channelOutletArray.length);

      this.setChannelOutput (channelIntake, this.channelIntakeArray);
      this.setChannelOutput (channelEngineBlockVibrations, this.channelEngineBlockVibrationsArray);
      this.setChannelOutput (channelOutlet, this.channelOutletArray);

      return true;
   }

}

registerProcessor("engine-sound-processor", EngineSoundGenerator)
